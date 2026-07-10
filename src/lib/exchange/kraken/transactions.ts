import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { investmentTransactions } from "@/db/schema/investment-transactions";
import {
  getInvestmentTransactionSyncState,
  saveInvestmentTransactionPage,
  summarizeSyncPhase,
  type InvestmentTransactionSyncCheckpoint,
  type InvestmentTransactionSyncState,
  type NormalizedInvestmentTransaction,
  type TransactionSyncPhase,
} from "@/lib/investment-transactions/ingestion";
import type {
  InvestmentTransactionListItem,
  TransactionExecutedAtRange,
} from "@/lib/investment-transactions/list-item";
import { getProviderTransactions } from "@/lib/investment-transactions/transaction-read";

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
const INCREMENTAL_SYNC_OVERLAP_DAYS = 7;

export type CurrentKrakenTransaction = InvestmentTransactionListItem;

export type KrakenTransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  hasMore: boolean;
  phase: TransactionSyncPhase;
};

type KrakenBackfillCursor = {
  endUnix: number;
  offset: number;
};

type KrakenBackfillCompleteCursor = {
  complete: true;
};

type KrakenBackfillCheckpoint = {
  version: 1;
  phase: "backfilling";
  backfill: KrakenBackfillCursor;
};

type KrakenForwardCheckpoint = {
  version: 1;
  phase: "catching_up" | "forward_sync";
  forward: { startUnix: number; endUnix: number; offset: number };
};

type KrakenUpToDateCheckpoint = {
  version: 1;
  phase: "up_to_date";
  forward: { scannedThroughUnix: number };
};

type KrakenTransactionCheckpoint =
  | KrakenBackfillCheckpoint
  | KrakenForwardCheckpoint
  | KrakenUpToDateCheckpoint;

export type KrakenTransactionSyncPageResult = {
  transactionCount: number;
  phase: KrakenTransactionCheckpoint["phase"];
  shouldContinue: boolean;
};

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

function earliestTradeDate(trades: NormalizedInvestmentTransaction[]): Date | null {
  if (trades.length === 0) return null;
  return trades.reduce(
    (earliest, trade) => (trade.executedAt < earliest ? trade.executedAt : earliest),
    trades[0].executedAt,
  );
}

function parseBackfillCursor(
  value: InvestmentTransactionSyncState["checkpoint"],
): KrakenBackfillCursor | null {
  if (!value) return null;
  const parsed = value as Partial<KrakenBackfillCursor>;
  if (
    typeof parsed.endUnix !== "number" || !Number.isFinite(parsed.endUnix) ||
    typeof parsed.offset !== "number" || !Number.isInteger(parsed.offset) || parsed.offset < 0
  ) {
    return null;
  }
  return { endUnix: parsed.endUnix, offset: parsed.offset };
}

function isBackfillCompleteCursor(
  value: InvestmentTransactionSyncState["checkpoint"],
): boolean {
  if (!value) return false;
  return (value as Partial<KrakenBackfillCompleteCursor>).complete === true;
}

function isKrakenTransactionCheckpoint(
  value: InvestmentTransactionSyncCheckpoint | null,
): value is KrakenTransactionCheckpoint {
  if (!value || value.version !== 1 || typeof value.phase !== "string") return false;
  if (value.phase === "backfilling") {
    return parseBackfillCursor(value.backfill as InvestmentTransactionSyncCheckpoint) !== null;
  }
  if (value.phase === "catching_up" || value.phase === "forward_sync") {
    const forward = value.forward as Partial<KrakenForwardCheckpoint["forward"]>;
    return typeof forward?.startUnix === "number" && typeof forward.endUnix === "number" && typeof forward.offset === "number";
  }
  return value.phase === "up_to_date" && typeof (value.forward as Partial<KrakenUpToDateCheckpoint["forward"]>)?.scannedThroughUnix === "number";
}

function isKrakenTransactionSyncComplete(
  value: InvestmentTransactionSyncCheckpoint | null,
): boolean {
  return isKrakenTransactionCheckpoint(value) && value.phase === "up_to_date";
}

function initialKrakenCheckpoint(nowUnix: number): KrakenBackfillCheckpoint {
  return { version: 1, phase: "backfilling", backfill: { endUnix: nowUnix, offset: 0 } };
}

/**
 * Advances one durable Kraken history page. The caller decides when to invoke
 * the next page; this function never loops or sleeps.
 */
export async function processKrakenTransactionSyncPage(input: {
  userId: string;
  account: SavedKrakenAccount;
}): Promise<KrakenTransactionSyncPageResult> {
  const state = await getInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.account.id,
    provider: KRAKEN_PROVIDER,
  });
  const now = new Date();
  const nowUnix = Math.floor(now.getTime() / 1000);
  const storedCheckpoint = state?.checkpoint ?? null;
  const legacyBackfill = parseBackfillCursor(storedCheckpoint);
  const checkpoint: KrakenTransactionCheckpoint = isKrakenTransactionCheckpoint(storedCheckpoint)
    ? storedCheckpoint
    : legacyBackfill
      ? { version: 1, phase: "backfilling", backfill: legacyBackfill }
      : isBackfillCompleteCursor(storedCheckpoint)
        ? {
            version: 1,
            phase: "up_to_date",
            forward: {
              scannedThroughUnix: Math.floor(
                (state?.latestSyncedExecutedAt ?? now).getTime() / 1000,
              ),
            },
          }
        : initialKrakenCheckpoint(nowUnix);
  const credentials = await getUserKrakenCredentials(input.userId, input.account.id);
  if (!credentials) throw new Error("Add Kraken API credentials before syncing transactions.");

  const pairs = await fetchKrakenAssetPairs();
  const request = checkpoint.phase === "backfilling"
    ? checkpoint.backfill
    : checkpoint.phase === "up_to_date"
      ? {
          startUnix: checkpoint.forward.scannedThroughUnix - INCREMENTAL_SYNC_OVERLAP_DAYS * 86_400,
          endUnix: nowUnix,
          offset: 0,
        }
      : checkpoint.forward;
  const page = await fetchKrakenTradesHistoryPage(credentials, request);
  const trades = Object.entries(page.trades).flatMap(([id, trade]) => {
    const normalized = normalizeTrade(id, trade, pairs);
    return normalized ? [normalized] : [];
  });
  const nextOffset = page.offset + Object.keys(page.trades).length;
  const hasMoreInWindow = nextOffset < page.count;

  let nextCheckpoint: KrakenTransactionCheckpoint;
  let backfillCompletedAt = state?.backfillCompletedAt ?? null;
  let latestSyncedExecutedAt = state?.latestSyncedExecutedAt ?? null;

  if (checkpoint.phase === "backfilling") {
    if (hasMoreInWindow) {
      nextCheckpoint = {
        ...checkpoint,
        backfill: { ...checkpoint.backfill, offset: nextOffset },
      };
    } else {
      nextCheckpoint = {
        version: 1,
        phase: "catching_up",
        forward: {
          startUnix: checkpoint.backfill.endUnix - INCREMENTAL_SYNC_OVERLAP_DAYS * 86_400,
          endUnix: nowUnix,
          offset: 0,
        },
      };
      backfillCompletedAt = now;
    }
  } else if (hasMoreInWindow) {
    nextCheckpoint = checkpoint.phase === "up_to_date"
      ? {
          version: 1,
          phase: "forward_sync",
          forward: {
            startUnix: checkpoint.forward.scannedThroughUnix - INCREMENTAL_SYNC_OVERLAP_DAYS * 86_400,
            endUnix: request.endUnix,
            offset: nextOffset,
          },
        }
      : {
          ...checkpoint,
          forward: {
            startUnix: checkpoint.forward.startUnix,
            endUnix: request.endUnix,
            offset: nextOffset,
          },
        };
  } else {
    nextCheckpoint = {
      version: 1,
      phase: "up_to_date",
      forward: { scannedThroughUnix: request.endUnix },
    };
    latestSyncedExecutedAt = new Date(request.endUnix * 1000);
  }

  const saved = await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions: trades,
    },
    syncState: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      provider: KRAKEN_PROVIDER,
      status: nextCheckpoint.phase === "up_to_date" ? "success" : "syncing",
      checkpoint: nextCheckpoint,
      earliestBackfilledAt: earliestTradeDate(trades) ?? state?.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt,
      backfillStartedAt: state?.backfillStartedAt ?? now,
      backfillCompletedAt,
      lastSyncedAt: now,
      lastHttpStatus: null,
      lastErrorMessage: null,
    },
  });

  return {
    transactionCount: saved.transactions.transactionCount,
    phase: nextCheckpoint.phase,
    shouldContinue: nextCheckpoint.phase !== "up_to_date",
  };
}

export async function getCurrentKrakenTransactions(
  userId: string,
  range?: TransactionExecutedAtRange,
): Promise<CurrentKrakenTransaction[]> {
  return getProviderTransactions({
    userId,
    sourceProvider: KRAKEN_PROVIDER,
    range,
  });
}

export async function getKrakenTransactionHistoryStatus(
  userId: string,
): Promise<KrakenTransactionHistoryStatus> {
  const accounts = await getUserKrakenAccounts(userId);
  if (accounts.length === 0) {
    return { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false, phase: "up_to_date" };
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
    hasMore: states.some(
      (state) => !isKrakenTransactionSyncComplete(state?.checkpoint ?? null),
    ),
    phase: summarizeSyncPhase(states),
  };
}
