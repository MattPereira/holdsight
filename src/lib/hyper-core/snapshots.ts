import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  financialAccountPositions,
  financialAccountSyncRuns,
  hyperCoreAccountSnapshots,
  hyperCorePositionDetails,
} from "@/db/schema/financial-accounts";
import type {
  HyperCorePosition,
  HyperCorePositionsResult,
} from "@/lib/hyper-core/client";
import {
  getHyperCorePositions,
  getHyperCoreSpotMarketData,
} from "@/lib/hyper-core/client";
import type { Position } from "@/lib/portfolio/types";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";

const HYPERLIQUID_PROVIDER = "hyperliquid";

function resultStatusToSyncStatus(
  status: HyperCorePositionsResult["status"],
): "success" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function positionToRow(syncRunId: string, position: HyperCorePosition) {
  return {
    syncRunId,
    sourcePositionId: position.sourcePositionId,
    symbol: position.symbol,
    name: position.name,
    assetClass: position.assetClass,
    amount: String(position.amount),
    priceUsd: String(position.priceUsd),
    valueUsd: String(position.valueUsd),
  };
}

export async function saveHyperCorePositionSnapshot(
  financialAccountId: string,
  result: HyperCorePositionsResult,
): Promise<void> {
  const [syncRun] = await db
    .insert(financialAccountSyncRuns)
    .values({
      financialAccountId,
      provider: HYPERLIQUID_PROVIDER,
      status: resultStatusToSyncStatus(result.status),
      finishedAt: new Date(),
      httpStatus: result.status === "error" ? result.httpStatus : undefined,
      errorMessage: result.status === "error" ? result.message : undefined,
    })
    .returning({ id: financialAccountSyncRuns.id });

  if (!syncRun || result.status !== "ready") return;

  if (result.accountSummary) {
    await db.insert(hyperCoreAccountSnapshots).values({
      syncRunId: syncRun.id,
      accountValue: result.accountSummary.accountValue,
      totalMarginUsed: result.accountSummary.totalMarginUsed,
      totalNtlPos: result.accountSummary.totalNtlPos,
      totalRawUsd: result.accountSummary.totalRawUsd,
      withdrawable: result.accountSummary.withdrawable,
      sourceTime: result.accountSummary.sourceTime,
      raw: result.accountSummary.raw,
    });
  }

  if (result.positions.length === 0) return;

  const insertedPositions = await db
    .insert(financialAccountPositions)
    .values(result.positions.map((position) => positionToRow(syncRun.id, position)))
    .returning({ id: financialAccountPositions.id });

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
    await db.insert(hyperCorePositionDetails).values(perpDetails);
  }
}

function toSpotPosition(row: {
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

export async function getLatestHyperCoreSpotPositionsByAccountId(
  financialAccountId: string,
): Promise<Position[]> {
  const [syncRun] = await db
    .select({
      id: financialAccountSyncRuns.id,
      status: financialAccountSyncRuns.status,
    })
    .from(financialAccountSyncRuns)
    .where(eq(financialAccountSyncRuns.financialAccountId, financialAccountId))
    .orderBy(desc(financialAccountSyncRuns.startedAt))
    .limit(1);

  if (!syncRun || syncRun.status !== "success") return [];

  const positions = await db
    .select({
      sourcePositionId: financialAccountPositions.sourcePositionId,
      symbol: financialAccountPositions.symbol,
      name: financialAccountPositions.name,
      amount: financialAccountPositions.amount,
      priceUsd: financialAccountPositions.priceUsd,
      valueUsd: financialAccountPositions.valueUsd,
    })
    .from(financialAccountPositions)
    .where(
      and(
        eq(financialAccountPositions.syncRunId, syncRun.id),
        inArray(financialAccountPositions.assetClass, ["token", "cash"]),
      ),
    )
    .orderBy(desc(financialAccountPositions.valueUsd));

  return positions.map(toSpotPosition);
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
      await saveHyperCorePositionSnapshot(account.id, {
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
    await saveHyperCorePositionSnapshot(account.id, result);
    if (result.status === "rate_limited") break;
  }
}
