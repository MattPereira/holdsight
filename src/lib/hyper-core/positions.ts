import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentAccounts,
  investmentPositions,
  hyperCorePositionDetails,
} from "@/db/schema/investment-accounts";
import type {
  HyperCorePosition,
  HyperCorePositionsResult,
} from "@/lib/hyper-core/client";
import {
  getHyperCorePositions,
  getHyperCoreSpotMarketData,
} from "@/lib/hyper-core/client";
import type { Position, PositionsResult } from "@/lib/portfolio/types";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";

const HYPERLIQUID_PROVIDER = "hyperliquid";

function resultStatusToSyncStatus(
  status: HyperCorePositionsResult["status"],
): "success" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function positionToRow(investmentAccountId: string, position: HyperCorePosition) {
  return {
    investmentAccountId,
    sourcePositionId: position.sourcePositionId,
    symbol: position.symbol,
    name: position.name,
    assetClass: position.assetClass,
    amount: String(position.amount),
    priceUsd: String(position.priceUsd),
    valueUsd: String(position.valueUsd),
  };
}

export async function replaceHyperCoreAccountPositions(
  investmentAccountId: string,
  result: HyperCorePositionsResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: HYPERLIQUID_PROVIDER,
        syncStatus: resultStatusToSyncStatus(result.status),
        syncHttpStatus: result.status === "error" ? result.httpStatus : null,
        syncErrorMessage: result.status === "error" ? result.message : null,
        lastSyncedAt: new Date(),
      })
      .where(eq(investmentAccounts.id, investmentAccountId));

    if (result.status !== "ready") return;

    await tx
      .delete(investmentPositions)
      .where(eq(investmentPositions.investmentAccountId, investmentAccountId));

    if (result.positions.length === 0) return;

    const insertedPositions = await tx
      .insert(investmentPositions)
      .values(
        result.positions.map((position) =>
          positionToRow(investmentAccountId, position),
        ),
      )
      .returning({ id: investmentPositions.id });

    const perpDetails = insertedPositions.flatMap((position, index) => {
      const detail = result.positions[index]?.hyperCorePerpDetails;
      if (!detail) return [];

      return [{
        positionId: position.id,
        market: detail.market,
        side: detail.side,
        signedSize: detail.signedSize,
        entryPx: detail.entryPx,
        liquidationPx: detail.liquidationPx,
        marginUsed: detail.marginUsed,
        unrealizedPnl: detail.unrealizedPnl,
        returnOnEquity: detail.returnOnEquity,
        leverageType: detail.leverageType,
        leverageValue: detail.leverageValue,
        rawLeverage: detail.rawLeverage,
      }];
    });

    if (perpDetails.length > 0) {
      await tx.insert(hyperCorePositionDetails).values(perpDetails);
    }
  });
}

function toPosition(row: {
  sourcePositionId: string | null;
  symbol: string;
  name: string | null;
  amount: string;
  priceUsd: string;
  valueUsd: string;
}): Position {
  return {
    sourcePositionId: row.sourcePositionId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    chainId: "hypercore",
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  };
}

export async function getCurrentHyperCoreSpotPositionsByAccountId(
  investmentAccountId: string,
): Promise<Position[]> {
  const [account] = await db
    .select({
      syncStatus: investmentAccounts.syncStatus,
    })
    .from(investmentAccounts)
    .where(eq(investmentAccounts.id, investmentAccountId))
    .limit(1);

  if (!account || account.syncStatus !== "success") return [];

  const positions = await db
    .select({
      sourcePositionId: investmentPositions.sourcePositionId,
      symbol: investmentPositions.symbol,
      name: investmentPositions.name,
      amount: investmentPositions.amount,
      priceUsd: investmentPositions.priceUsd,
      valueUsd: investmentPositions.valueUsd,
    })
    .from(investmentPositions)
    .where(
      and(
        eq(investmentPositions.investmentAccountId, investmentAccountId),
        inArray(investmentPositions.assetClass, ["token", "cash"]),
      ),
    )
    .orderBy(desc(investmentPositions.valueUsd));

  return positions.map(toPosition);
}

export async function getCurrentHyperCorePositions(
  accounts: SavedHyperCoreAccount[],
): Promise<PositionsResult[]> {
  const results: PositionsResult[] = [];

  for (const account of accounts) {
    if (account.syncStatus === "idle") {
      results.push({
        status: "ready",
        address: account.address,
        positions: [],
      });
      continue;
    }

    if (account.syncStatus === "indexing" || account.syncStatus === "rate_limited") {
      results.push({ status: account.syncStatus, address: account.address });
      continue;
    }

    if (account.syncStatus === "error") {
      results.push({
        status: "error",
        address: account.address,
        message: account.syncErrorMessage ?? "HyperCore position sync failed.",
        httpStatus: account.syncHttpStatus ?? 502,
      });
      continue;
    }

    const positions = await db
      .select({
        sourcePositionId: investmentPositions.sourcePositionId,
        symbol: investmentPositions.symbol,
        name: investmentPositions.name,
        amount: investmentPositions.amount,
        priceUsd: investmentPositions.priceUsd,
        valueUsd: investmentPositions.valueUsd,
      })
      .from(investmentPositions)
      .where(eq(investmentPositions.investmentAccountId, account.id))
      .orderBy(desc(investmentPositions.valueUsd));

    results.push({
      status: "ready",
      address: account.address,
      positions: positions.map(toPosition),
    });
  }

  return results;
}

export async function syncHyperCoreAccounts(
  accounts: SavedHyperCoreAccount[],
): Promise<void> {
  if (accounts.length === 0) return;

  let spotMarketData: Awaited<ReturnType<typeof getHyperCoreSpotMarketData>>;
  try {
    spotMarketData = await getHyperCoreSpotMarketData();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Hyperliquid spot market data error";

    for (const account of accounts) {
      await replaceHyperCoreAccountPositions(account.id, {
        status: "error",
        address: account.address,
        message,
        httpStatus: 502,
      });
    }
    return;
  }

  for (const account of accounts) {
    const result = await getHyperCorePositions(account.address, spotMarketData);
    await replaceHyperCoreAccountPositions(account.id, result);
    if (result.status === "rate_limited") break;
  }
}
