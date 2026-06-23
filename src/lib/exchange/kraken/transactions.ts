import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import { investmentTransactions } from "@/db/schema/investment-transactions";
import {
  getInvestmentTransactionSyncState,
  upsertInvestmentTransactions,
  upsertInvestmentTransactionSyncState,
  type InvestmentTransactionSyncState,
  type NormalizedInvestmentTransaction,
} from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

import {
  getUserKrakenAccounts,
  getUserKrakenCredentials,
  type SavedKrakenAccount,
} from "./accounts";
import {
  fetchKrakenAssetPairs,
  fetchKrakenTradesHistoryPage,
  normalizeKrakenAssetSymbol,
  type KrakenAssetPair,
  type KrakenTrade,
} from "./client";

const KRAKEN_PROVIDER = "kraken";
const INITIAL_SYNC_LOOKBACK_DAYS = 30;
const INCREMENTAL_SYNC_OVERLAP_DAYS = 7;

export type CurrentKrakenTransaction = InvestmentTransactionListItem;

export type SyncUserKrakenTransactionsResult = {
  accountCount: number;
  transactionCount: number;
  failures: Array<{ accountId: string; message: string; httpStatus: number }>;
};

export type KrakenTransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  hasMore: boolean;
};

type KrakenBackfillCursor = {
  endUnix: number;
  offset: number;
};

type KrakenBackfillCompleteCursor = {
  complete: true;
};

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function dateMinusDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function assetPairForTrade(
  pairName: string | undefined,
  pairs: Record<string, KrakenAssetPair>,
): { base: string | null; quote: string | null } {
  if (!pairName) return { base: null, quote: null };
  const pair = pairs[pairName] ?? Object.values(pairs).find(
    (candidate) => candidate.altname === pairName || candidate.wsname?.replace("/", "") === pairName,
  );
  return {
    base: pair?.base ? normalizeKrakenAssetSymbol(pair.base) : null,
    quote: pair?.quote ? normalizeKrakenAssetSymbol(pair.quote) : null,
  };
}

function normalizeTrade(
  sourceTransactionId: string,
  trade: KrakenTrade,
  pairs: Record<string, KrakenAssetPair>,
): NormalizedInvestmentTransaction | null {
  if (!trade.time || (trade.type !== "buy" && trade.type !== "sell")) return null;
  const assets = assetPairForTrade(trade.pair, pairs);
  const cost = trade.cost ?? null;

  return {
    sourceProvider: KRAKEN_PROVIDER,
    sourceTransactionId,
    sourceAccountId: null,
    executedAt: new Date(trade.time * 1000),
    kind: "trade",
    side: trade.type,
    baseAssetSymbol: assets.base,
    baseAmount: trade.vol ?? null,
    quoteAssetSymbol: assets.quote,
    quoteAmount: cost,
    priceQuote: trade.price ?? null,
    valueUsd: assets.quote === "USD" ? cost : null,
    feeAmount: trade.fee ?? null,
    feeAssetSymbol: trade.fee ? assets.quote : null,
    status: "confirmed",
    raw: trade,
  };
}

function latestTradeDate(trades: NormalizedInvestmentTransaction[]): Date | null {
  if (trades.length === 0) return null;
  return trades.reduce(
    (latest, trade) => (trade.executedAt > latest ? trade.executedAt : latest),
    trades[0].executedAt,
  );
}

function earliestTradeDate(trades: NormalizedInvestmentTransaction[]): Date | null {
  if (trades.length === 0) return null;
  return trades.reduce(
    (earliest, trade) => (trade.executedAt < earliest ? trade.executedAt : earliest),
    trades[0].executedAt,
  );
}

function parseBackfillCursor(value: string | null): KrakenBackfillCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<KrakenBackfillCursor>;
    if (
      typeof parsed.endUnix !== "number" || !Number.isFinite(parsed.endUnix) ||
      typeof parsed.offset !== "number" || !Number.isInteger(parsed.offset) || parsed.offset < 0
    ) return null;
    return { endUnix: parsed.endUnix, offset: parsed.offset };
  } catch {
    return null;
  }
}

function isBackfillCompleteCursor(value: string | null): boolean {
  if (!value) return false;
  try {
    return (JSON.parse(value) as Partial<KrakenBackfillCompleteCursor>).complete === true;
  } catch {
    return false;
  }
}

async function updateSyncState(input: {
  userId: string;
  accountId: string;
  state: InvestmentTransactionSyncState | null;
  status: "success" | "rate_limited" | "error";
  cursor?: string | null;
  backfillCompleted?: boolean;
  earliestBackfilledAt?: Date | null;
  latestSyncedExecutedAt?: Date | null;
  error?: { message: string; httpStatus: number };
}): Promise<void> {
  const now = new Date();
  await upsertInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.accountId,
    provider: KRAKEN_PROVIDER,
    status: input.status,
    cursor: input.cursor ?? input.state?.cursor ?? null,
    earliestBackfilledAt: input.earliestBackfilledAt ?? input.state?.earliestBackfilledAt ?? null,
    latestSyncedExecutedAt: input.latestSyncedExecutedAt ?? input.state?.latestSyncedExecutedAt ?? null,
    backfillStartedAt: input.state?.backfillStartedAt ?? now,
    backfillCompletedAt: input.backfillCompleted && input.status === "success"
      ? now
      : input.state?.backfillCompletedAt ?? null,
    lastSyncedAt: now,
    lastHttpStatus: input.error?.httpStatus ?? null,
    lastErrorMessage: input.error?.message ?? null,
  });
}

export async function getCurrentKrakenTransactions(
  userId: string,
  limit = 200,
): Promise<CurrentKrakenTransaction[]> {
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
    .innerJoin(investmentAccounts, eq(investmentAccounts.id, investmentTransactions.investmentAccountId))
    .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, KRAKEN_PROVIDER)))
    .orderBy(desc(investmentTransactions.executedAt))
    .limit(limit);

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

export async function getKrakenTransactionHistoryStatus(
  userId: string,
): Promise<KrakenTransactionHistoryStatus> {
  const accounts = await getUserKrakenAccounts(userId);
  if (accounts.length === 0) {
    return { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false };
  }

  const [earliest, latest, states] = await Promise.all([
    db.select({ executedAt: investmentTransactions.executedAt })
      .from(investmentTransactions)
      .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, KRAKEN_PROVIDER)))
      .orderBy(asc(investmentTransactions.executedAt)).limit(1),
    db.select({ executedAt: investmentTransactions.executedAt })
      .from(investmentTransactions)
      .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, KRAKEN_PROVIDER)))
      .orderBy(desc(investmentTransactions.executedAt)).limit(1),
    Promise.all(accounts.map((account) => getInvestmentTransactionSyncState({ userId, investmentAccountId: account.id, provider: KRAKEN_PROVIDER }))),
  ]);

  return {
    earliestTransactionAt: earliest[0]?.executedAt.toISOString() ?? null,
    latestTransactionAt: latest[0]?.executedAt.toISOString() ?? null,
    hasMore: states.some((state) => !isBackfillCompleteCursor(state?.cursor ?? null)),
  };
}

async function syncKrakenAccountTransactions(
  userId: string,
  account: SavedKrakenAccount,
  pairs: Record<string, KrakenAssetPair>,
): Promise<{ transactionCount: number; failure?: { accountId: string; message: string; httpStatus: number } }> {
  const state = await getInvestmentTransactionSyncState({ userId, investmentAccountId: account.id, provider: KRAKEN_PROVIDER });
  const now = new Date();
  const start = state?.latestSyncedExecutedAt
    ? dateMinusDays(state.latestSyncedExecutedAt, INCREMENTAL_SYNC_OVERLAP_DAYS)
    : dateMinusDays(now, INITIAL_SYNC_LOOKBACK_DAYS);
  const credentials = await getUserKrakenCredentials(userId, account.id);

  if (!credentials) {
    const error = { message: "Add Kraken API credentials before syncing transactions.", httpStatus: 400 };
    await updateSyncState({ userId, accountId: account.id, state, status: "error", error });
    return { transactionCount: 0, failure: { accountId: account.id, ...error } };
  }

  try {
    const result = await fetchKrakenTradesHistoryPage(credentials, {
      startUnix: Math.floor(start.getTime() / 1000),
      endUnix: Math.floor(now.getTime() / 1000),
    });
    const trades = Object.entries(result.trades).flatMap(([id, trade]) => {
      const normalized = normalizeTrade(id, trade, pairs);
      return normalized ? [normalized] : [];
    });
    const written = await upsertInvestmentTransactions({ userId, investmentAccountId: account.id, transactions: trades });
    await updateSyncState({
      userId,
      accountId: account.id,
      state,
      status: "success",
      earliestBackfilledAt: state?.earliestBackfilledAt ?? start,
      latestSyncedExecutedAt: latestTradeDate(trades) ?? state?.latestSyncedExecutedAt ?? now,
    });
    return { transactionCount: written.transactionCount };
  } catch (caught) {
    const httpStatus = caught instanceof Error && "httpStatus" in caught ? Number(caught.httpStatus) : 502;
    const error = { message: caught instanceof Error ? caught.message : "Kraken transaction sync failed.", httpStatus: Number.isFinite(httpStatus) ? httpStatus : 502 };
    await updateSyncState({ userId, accountId: account.id, state, status: error.httpStatus === 429 ? "rate_limited" : "error", error });
    return { transactionCount: 0, failure: { accountId: account.id, ...error } };
  }
}

async function backfillKrakenAccountTrades(
  userId: string,
  account: SavedKrakenAccount,
  pairs: Record<string, KrakenAssetPair>,
): Promise<{ transactionCount: number; failure?: { accountId: string; message: string; httpStatus: number } }> {
  const state = await getInvestmentTransactionSyncState({ userId, investmentAccountId: account.id, provider: KRAKEN_PROVIDER });
  const cursor = parseBackfillCursor(state?.cursor ?? null) ?? {
    endUnix: Math.floor(Date.now() / 1000),
    offset: 0,
  };
  const credentials = await getUserKrakenCredentials(userId, account.id);

  if (!credentials) {
    const error = { message: "Add Kraken API credentials before loading older trades.", httpStatus: 400 };
    await updateSyncState({ userId, accountId: account.id, state, status: "error", error });
    return { transactionCount: 0, failure: { accountId: account.id, ...error } };
  }

  try {
    const page = await fetchKrakenTradesHistoryPage(credentials, cursor);
    const trades = Object.entries(page.trades).flatMap(([id, trade]) => {
      const normalized = normalizeTrade(id, trade, pairs);
      return normalized ? [normalized] : [];
    });
    const written = await upsertInvestmentTransactions({ userId, investmentAccountId: account.id, transactions: trades });
    const nextOffset = page.offset + Object.keys(page.trades).length;
    const hasMore = nextOffset < page.count;
    await updateSyncState({
      userId,
      accountId: account.id,
      state,
      status: "success",
      cursor: hasMore
        ? JSON.stringify({ ...cursor, offset: nextOffset })
        : JSON.stringify({ complete: true }),
      backfillCompleted: !hasMore,
      earliestBackfilledAt: earliestTradeDate(trades) ?? state?.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt: state?.latestSyncedExecutedAt ?? latestTradeDate(trades) ?? null,
    });
    return { transactionCount: written.transactionCount };
  } catch (caught) {
    const httpStatus = caught instanceof Error && "httpStatus" in caught ? Number(caught.httpStatus) : 502;
    const error = { message: caught instanceof Error ? caught.message : "Kraken trade backfill failed.", httpStatus: Number.isFinite(httpStatus) ? httpStatus : 502 };
    await updateSyncState({ userId, accountId: account.id, state, status: error.httpStatus === 429 ? "rate_limited" : "error", error });
    return { transactionCount: 0, failure: { accountId: account.id, ...error } };
  }
}

export async function syncUserKrakenTransactions(userId: string): Promise<SyncUserKrakenTransactionsResult> {
  const accounts = await getUserKrakenAccounts(userId);
  const pairs = await fetchKrakenAssetPairs();
  const results = await Promise.all(accounts.map((account) => syncKrakenAccountTransactions(userId, account, pairs)));
  return {
    accountCount: accounts.length,
    transactionCount: results.reduce((total, result) => total + result.transactionCount, 0),
    failures: results.flatMap((result) => result.failure ? [result.failure] : []),
  };
}

/** Load one persisted, rate-limit-safe page of older Kraken trades per account. */
export async function backfillUserKrakenTrades(userId: string): Promise<SyncUserKrakenTransactionsResult> {
  const accounts = await getUserKrakenAccounts(userId);
  const pairs = await fetchKrakenAssetPairs();
  const results = await Promise.all(accounts.map((account) => backfillKrakenAccountTrades(userId, account, pairs)));
  return {
    accountCount: accounts.length,
    transactionCount: results.reduce((total, result) => total + result.transactionCount, 0),
    failures: results.flatMap((result) => result.failure ? [result.failure] : []),
  };
}
