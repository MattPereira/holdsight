import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import { investmentTransactions } from "@/db/schema/investment-transactions";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";
import {
  fetchHyperCoreFillsPage,
  getHyperCoreSpotMarketSymbols,
  type HyperCoreFill,
} from "@/lib/hyper-core/client";
import {
  getInvestmentTransactionSyncState,
  saveInvestmentTransactionPage,
  type InvestmentTransactionSide,
  type InvestmentTransactionSyncCheckpoint,
  summarizeSyncPhase,
  type NormalizedHyperCoreTransactionDetails,
  type NormalizedInvestmentTransaction,
  type TransactionSyncPhase,
} from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const HYPERLIQUID_PROVIDER = "hyperliquid";
const HYPERCORE_CHAIN_ID = "hypercore";
const HYPERCORE_FILLS_PAGE_LIMIT = 2_000;
const INCREMENTAL_SYNC_OVERLAP_MS = 24 * 60 * 60 * 1_000;

type HyperCoreFillsCheckpoint =
  | { version: 1; phase: "backfilling" | "forward_sync"; scan: { startTime: number; endTime: number } }
  | { version: 1; phase: "up_to_date"; scannedThroughTime: number };

export type HyperCoreTransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  hasMore: boolean;
  phase: TransactionSyncPhase;
};

export type HyperCoreTransactionSyncPageResult = {
  transactionCount: number;
  phase: HyperCoreFillsCheckpoint["phase"];
  shouldContinue: boolean;
};

export type CurrentHyperCoreTransaction = InvestmentTransactionListItem;

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function isScan(value: unknown): value is { startTime: number; endTime: number } {
  if (!value || typeof value !== "object") return false;
  const scan = value as Partial<{ startTime: number; endTime: number }>;
  return Number.isFinite(scan.startTime) && Number.isFinite(scan.endTime);
}

function isHyperCoreFillsCheckpoint(
  value: InvestmentTransactionSyncCheckpoint | null,
): value is HyperCoreFillsCheckpoint {
  if (!value || value.version !== 1 || typeof value.phase !== "string") return false;
  if (value.phase === "backfilling" || value.phase === "forward_sync") {
    return isScan(value.scan);
  }
  return value.phase === "up_to_date" && typeof value.scannedThroughTime === "number";
}

function isHyperCoreTransactionSyncComplete(
  value: InvestmentTransactionSyncCheckpoint | null,
): boolean {
  return isHyperCoreFillsCheckpoint(value) && value.phase === "up_to_date";
}

function initialCheckpoint(now: number): HyperCoreFillsCheckpoint {
  return {
    version: 1,
    phase: "backfilling",
    scan: { startTime: 0, endTime: now },
  };
}

function sourceTransactionId(fill: HyperCoreFill): string {
  return `fill:${fill.tid}`;
}

function sideForFill(fill: HyperCoreFill): InvestmentTransactionSide {
  const direction = fill.dir.toLowerCase();
  if (direction.startsWith("open")) return "open";
  if (direction.startsWith("close")) return "close";
  if (direction === "buy") return "buy";
  if (direction === "sell") return "sell";
  return fill.side === "B" ? "buy" : "sell";
}

function amountAtPrice(fill: HyperCoreFill): number | null {
  const price = Number(fill.px);
  const amount = Number(fill.sz);
  if (!Number.isFinite(price) || !Number.isFinite(amount)) return null;
  return price * amount;
}

function assetSymbolsForFill(
  fill: HyperCoreFill,
  spotMarketSymbols: Map<string, string>,
): { base: string; quote: string } {
  const spotPair = spotMarketSymbols.get(fill.coin);
  if (!spotPair) return { base: fill.coin, quote: "USDC" };

  const [base, quote] = spotPair.split("/");
  return { base: base || fill.coin, quote: quote || "USDC" };
}

function normalizeFill(
  fill: HyperCoreFill,
  spotMarketSymbols: Map<string, string>,
): NormalizedInvestmentTransaction {
  const assets = assetSymbolsForFill(fill, spotMarketSymbols);
  const quoteAmount = amountAtPrice(fill);

  return {
    sourceProvider: HYPERLIQUID_PROVIDER,
    sourceTransactionId: sourceTransactionId(fill),
    sourceAccountId: null,
    executedAt: new Date(fill.time),
    kind: "trade",
    side: sideForFill(fill),
    baseAssetSymbol: assets.base,
    baseAssetId: fill.coin,
    baseAmount: fill.sz,
    quoteAssetSymbol: assets.quote,
    quoteAmount,
    priceQuote: fill.px,
    valueUsd: assets.quote === "USDC" ? quoteAmount : null,
    feeAmount: fill.fee,
    feeAssetSymbol: fill.feeToken,
    chainId: HYPERCORE_CHAIN_ID,
    txHash: fill.hash,
    status: "confirmed",
    raw: fill,
  };
}

function normalizeFillDetails(fill: HyperCoreFill): NormalizedHyperCoreTransactionDetails {
  return {
    sourceTransactionId: sourceTransactionId(fill),
    market: fill.coin,
    orderId: String(fill.oid),
    fillId: String(fill.tid),
    direction: fill.dir,
    crossed: fill.crossed,
    feeToken: fill.feeToken,
  };
}

function earliestFillDate(fills: HyperCoreFill[]): Date | null {
  if (fills.length === 0) return null;
  return new Date(Math.min(...fills.map((fill) => fill.time)));
}

/** Advances one durable, time-paginated HyperCore fills page. */
export async function processHyperCoreTransactionSyncPage(input: {
  userId: string;
  account: SavedHyperCoreAccount;
}): Promise<HyperCoreTransactionSyncPageResult> {
  const state = await getInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.account.id,
    provider: HYPERLIQUID_PROVIDER,
  });
  const now = Date.now();
  const storedCheckpoint = state?.checkpoint ?? null;
  const checkpoint = isHyperCoreFillsCheckpoint(storedCheckpoint)
    ? storedCheckpoint
    : initialCheckpoint(now);
  const scan = checkpoint.phase === "up_to_date"
    ? {
        startTime: Math.max(0, checkpoint.scannedThroughTime - INCREMENTAL_SYNC_OVERLAP_MS),
        endTime: now,
      }
    : checkpoint.scan;
  const [fills, spotMarketSymbols] = await Promise.all([
    fetchHyperCoreFillsPage({ address: input.account.address, ...scan }),
    getHyperCoreSpotMarketSymbols(),
  ]);
  const latestFillTime = fills.reduce(
    (latest, fill) => Math.max(latest, fill.time),
    scan.startTime,
  );
  const hasMore = fills.length >= HYPERCORE_FILLS_PAGE_LIMIT;
  if (hasMore && latestFillTime <= scan.startTime) {
    throw new Error("HyperCore fills page did not advance the time cursor.");
  }

  const nextCheckpoint: HyperCoreFillsCheckpoint = hasMore
    ? {
        version: 1,
        phase: checkpoint.phase === "up_to_date" ? "forward_sync" : checkpoint.phase,
        scan: { startTime: latestFillTime, endTime: scan.endTime },
      }
    : { version: 1, phase: "up_to_date", scannedThroughTime: scan.endTime };
  const syncCompleted = nextCheckpoint.phase === "up_to_date";
  const nowDate = new Date();
  const saved = await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions: fills.map((fill) => normalizeFill(fill, spotMarketSymbols)),
      hyperCoreDetails: fills.map(normalizeFillDetails),
    },
    syncState: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      provider: HYPERLIQUID_PROVIDER,
      status: syncCompleted ? "success" : "syncing",
      checkpoint: nextCheckpoint,
      earliestBackfilledAt: earliestFillDate(fills) ?? state?.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt: syncCompleted ? new Date(scan.endTime) : state?.latestSyncedExecutedAt ?? null,
      backfillStartedAt: state?.backfillStartedAt ?? nowDate,
      backfillCompletedAt: syncCompleted ? nowDate : state?.backfillCompletedAt ?? null,
      lastSyncedAt: nowDate,
      lastHttpStatus: null,
      lastErrorMessage: null,
    },
  });

  return {
    transactionCount: saved.transactions.transactionCount,
    phase: nextCheckpoint.phase,
    shouldContinue: !syncCompleted,
  };
}

export async function getCurrentHyperCoreTransactions(
  userId: string,
): Promise<CurrentHyperCoreTransaction[]> {
  const rows = await db
    .select({
      id: investmentTransactions.id,
      investmentAccountId: investmentTransactions.investmentAccountId,
      accountLabel: investmentAccounts.label,
      sourceTransactionId: investmentTransactions.sourceTransactionId,
      sourceAccountId: investmentTransactions.sourceAccountId,
      executedAt: investmentTransactions.executedAt,
      settledAt: investmentTransactions.settledAt,
      kind: investmentTransactions.kind,
      side: investmentTransactions.side,
      baseAssetSymbol: investmentTransactions.baseAssetSymbol,
      baseAssetId: investmentTransactions.baseAssetId,
      baseAmount: investmentTransactions.baseAmount,
      quoteAssetSymbol: investmentTransactions.quoteAssetSymbol,
      quoteAmount: investmentTransactions.quoteAmount,
      priceQuote: investmentTransactions.priceQuote,
      valueUsd: investmentTransactions.valueUsd,
      feeAmount: investmentTransactions.feeAmount,
      feeAssetSymbol: investmentTransactions.feeAssetSymbol,
      status: investmentTransactions.status,
    })
    .from(investmentTransactions)
    .innerJoin(
      investmentAccounts,
      eq(investmentAccounts.id, investmentTransactions.investmentAccountId),
    )
    .where(
      and(
        eq(investmentTransactions.userId, userId),
        eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER),
      ),
    )
    .orderBy(desc(investmentTransactions.executedAt));

  return rows.map((row) => ({
    ...row,
    executedAt: row.executedAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
    baseAmount: numberOrNull(row.baseAmount),
    quoteAmount: numberOrNull(row.quoteAmount),
    priceQuote: numberOrNull(row.priceQuote),
    valueUsd: numberOrNull(row.valueUsd),
    feeAmount: numberOrNull(row.feeAmount),
  }));
}

export async function getHyperCoreTransactionHistoryStatus(
  userId: string,
  accounts: SavedHyperCoreAccount[],
): Promise<HyperCoreTransactionHistoryStatus> {
  if (accounts.length === 0) {
    return { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false, phase: "up_to_date" };
  }

  const [earliest, latest, states] = await Promise.all([
    db.select({ executedAt: investmentTransactions.executedAt })
      .from(investmentTransactions)
      .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER)))
      .orderBy(asc(investmentTransactions.executedAt)).limit(1),
    db.select({ executedAt: investmentTransactions.executedAt })
      .from(investmentTransactions)
      .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER)))
      .orderBy(desc(investmentTransactions.executedAt)).limit(1),
    Promise.all(accounts.map((account) => getInvestmentTransactionSyncState({
      userId,
      investmentAccountId: account.id,
      provider: HYPERLIQUID_PROVIDER,
    }))),
  ]);

  return {
    earliestTransactionAt: earliest[0]?.executedAt.toISOString() ?? null,
    latestTransactionAt: latest[0]?.executedAt.toISOString() ?? null,
    hasMore: states.some((state) => !isHyperCoreTransactionSyncComplete(state?.checkpoint ?? null)),
    phase: summarizeSyncPhase(states),
  };
}
