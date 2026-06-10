import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  evmPositionDetails,
  financialAccountPositions,
  financialAccountSyncRuns,
} from "@/db/schema/financial-accounts";
import { getUserEvmAccounts, type SavedEvmAccount } from "@/lib/evm/accounts";
import { getWalletPositions } from "@/lib/evm/client";
import type { Position, PositionsResult } from "@/lib/portfolio/types";

const ZERION_PROVIDER = "zerion";

function resultStatusToSyncStatus(
  status: PositionsResult["status"],
): "success" | "indexing" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function positionToRow(syncRunId: string, position: Position) {
  return {
    syncRunId,
    sourcePositionId: position.sourcePositionId,
    symbol: position.symbol,
    name: position.name,
    assetClass: "token" as const,
    amount: String(position.amount),
    priceUsd: String(position.priceUsd),
    valueUsd: String(position.valueUsd),
  };
}

export async function saveEvmPositionSnapshot(
  financialAccountId: string,
  result: PositionsResult,
): Promise<void> {
  const [syncRun] = await db
    .insert(financialAccountSyncRuns)
    .values({
      financialAccountId,
      provider: ZERION_PROVIDER,
      status: resultStatusToSyncStatus(result.status),
      finishedAt: new Date(),
      httpStatus: result.status === "error" ? result.httpStatus : undefined,
      errorMessage: result.status === "error" ? result.message : undefined,
    })
    .returning({ id: financialAccountSyncRuns.id });

  if (!syncRun || result.status !== "ready" || result.positions.length === 0) {
    return;
  }

  const insertedPositions = await db
    .insert(financialAccountPositions)
    .values(result.positions.map((position) => positionToRow(syncRun.id, position)))
    .returning({ id: financialAccountPositions.id });

  const details = insertedPositions.map((position, index) => ({
    positionId: position.id,
    chainId: result.positions[index]?.chainId ?? "unknown",
    contractAddress: result.positions[index]?.contractAddress,
  }));

  if (details.length > 0) {
    await db.insert(evmPositionDetails).values(details);
  }
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

export async function getLatestEvmPositionSnapshots(
  userId: string,
): Promise<PositionsResult[]> {
  const wallets = await getUserEvmAccounts(userId);
  const results: PositionsResult[] = [];

  for (const wallet of wallets) {
    const [syncRun] = await db
      .select({
        id: financialAccountSyncRuns.id,
        status: financialAccountSyncRuns.status,
        httpStatus: financialAccountSyncRuns.httpStatus,
        errorMessage: financialAccountSyncRuns.errorMessage,
      })
      .from(financialAccountSyncRuns)
      .where(eq(financialAccountSyncRuns.financialAccountId, wallet.id))
      .orderBy(desc(financialAccountSyncRuns.startedAt))
      .limit(1);

    if (!syncRun) {
      results.push({
        status: "ready",
        address: wallet.address,
        positions: [],
      });
      continue;
    }

    if (syncRun.status === "indexing" || syncRun.status === "rate_limited") {
      results.push({ status: syncRun.status, address: wallet.address });
      continue;
    }

    if (syncRun.status === "error") {
      results.push({
        status: "error",
        address: wallet.address,
        message: syncRun.errorMessage ?? "Position sync failed.",
        httpStatus: syncRun.httpStatus ?? 502,
      });
      continue;
    }

    const positions = await db
      .select({
        sourcePositionId: financialAccountPositions.sourcePositionId,
        symbol: financialAccountPositions.symbol,
        name: financialAccountPositions.name,
        amount: financialAccountPositions.amount,
        priceUsd: financialAccountPositions.priceUsd,
        valueUsd: financialAccountPositions.valueUsd,
        chainId: evmPositionDetails.chainId,
        contractAddress: evmPositionDetails.contractAddress,
      })
      .from(financialAccountPositions)
      .leftJoin(
        evmPositionDetails,
        eq(evmPositionDetails.positionId, financialAccountPositions.id),
      )
      .where(eq(financialAccountPositions.syncRunId, syncRun.id))
      .orderBy(desc(financialAccountPositions.valueUsd));

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
    await saveEvmPositionSnapshot(wallet.id, result);
    if (result.status === "rate_limited") break;
  }
}
