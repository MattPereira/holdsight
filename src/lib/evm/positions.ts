import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  evmPositionDetails,
  investmentAccounts,
  investmentPositions,
} from "@/db/schema/investment-accounts";
import { getUserEvmAccounts, type SavedEvmAccount } from "@/lib/evm/accounts";
import { getWalletPositions } from "@/lib/evm/client";
import type { Position, PositionsResult } from "@/lib/portfolio/types";

const ZERION_PROVIDER = "zerion";

function resultStatusToSyncStatus(
  status: PositionsResult["status"],
): "success" | "indexing" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function positionToRow(investmentAccountId: string, position: Position) {
  return {
    investmentAccountId,
    sourcePositionId: position.sourcePositionId,
    symbol: position.symbol,
    name: position.name,
    assetClass: "token" as const,
    amount: String(position.amount),
    priceUsd: String(position.priceUsd),
    valueUsd: String(position.valueUsd),
  };
}

export async function replaceEvmAccountPositions(
  investmentAccountId: string,
  result: PositionsResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: ZERION_PROVIDER,
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

    const details = insertedPositions.map((position, index) => ({
      positionId: position.id,
      chainId: result.positions[index]?.chainId ?? "unknown",
      contractAddress: result.positions[index]?.contractAddress,
    }));

    if (details.length > 0) {
      await tx.insert(evmPositionDetails).values(details);
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
  chainId: string | null;
  contractAddress: string | null;
}): Position {
  return {
    sourcePositionId: row.sourcePositionId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    chainId: row.chainId ?? "unknown",
    contractAddress: row.contractAddress ?? undefined,
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  };
}

export async function getCurrentEvmPositions(
  userId: string,
): Promise<PositionsResult[]> {
  const wallets = await getUserEvmAccounts(userId);
  const results: PositionsResult[] = [];

  for (const wallet of wallets) {
    if (wallet.syncStatus === "idle") {
      results.push({
        status: "ready",
        address: wallet.address,
        positions: [],
      });
      continue;
    }

    if (wallet.syncStatus === "indexing" || wallet.syncStatus === "rate_limited") {
      results.push({ status: wallet.syncStatus, address: wallet.address });
      continue;
    }

    if (wallet.syncStatus === "error") {
      results.push({
        status: "error",
        address: wallet.address,
        message: wallet.syncErrorMessage ?? "Position sync failed.",
        httpStatus: wallet.syncHttpStatus ?? 502,
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
        chainId: evmPositionDetails.chainId,
        contractAddress: evmPositionDetails.contractAddress,
      })
      .from(investmentPositions)
      .leftJoin(
        evmPositionDetails,
        eq(evmPositionDetails.positionId, investmentPositions.id),
      )
      .where(eq(investmentPositions.investmentAccountId, wallet.id))
      .orderBy(desc(investmentPositions.valueUsd));

    results.push({
      status: "ready",
      address: wallet.address,
      positions: positions.map(toPosition),
    });
  }

  return results;
}

/**
 * Fetch EVM positions for every tracked wallet. Called from the client only on
 * a button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially so we never burst past the per-second rate
 * limit. If we get rate limited, we stop immediately rather than spending more
 * of the limited daily quota on calls that would also fail.
 */
export async function syncEvmWalletPositions(
  wallets: SavedEvmAccount[],
): Promise<void> {
  for (const wallet of wallets) {
    const result = await getWalletPositions(wallet.address);
    await replaceEvmAccountPositions(wallet.id, result);
    if (result.status === "rate_limited") break;
  }
}
