import "server-only";

import { and, asc, count, desc, eq, inArray, max, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import {
  hyperCorePerpEvents,
  investmentTransactionSyncs,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import type { SavedEvmAccount } from "@/lib/evm/accounts";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";
import type { SavedLighterAccount } from "@/lib/lighter/accounts";
import { summarizeSyncPhase, type TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const WALLET_TRANSACTION_PROVIDERS = ["hyperliquid", "lighter", "zerion"] as const;
const WALLET_VISIBLE_TRANSACTION_KINDS = ["trade"] as const;
const HYPER_CORE_SPOT_TRANSACTION_SIDES = ["buy", "sell"] as const;

export type WalletTransactionHistoryStatus = {
  transactionCount: number;
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  latestTransactionUpdatedAt: string | null;
  hasMore: boolean;
  phase: TransactionSyncPhase;
};

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function visibleWalletProviderScope() {
  return or(
    eq(investmentTransactions.sourceProvider, "zerion"),
    eq(investmentTransactions.sourceProvider, "lighter"),
    and(
      eq(investmentTransactions.sourceProvider, "hyperliquid"),
      inArray(
        investmentTransactions.side,
        HYPER_CORE_SPOT_TRANSACTION_SIDES,
      ),
    ),
  );
}

export async function getCurrentWalletTransactions(userId: string): Promise<InvestmentTransactionListItem[]> {
  const rawRows = await db
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
    .where(and(
      eq(investmentTransactions.userId, userId),
      inArray(investmentTransactions.sourceProvider, WALLET_TRANSACTION_PROVIDERS),
      inArray(investmentTransactions.kind, WALLET_VISIBLE_TRANSACTION_KINDS),
      visibleWalletProviderScope(),
    ))
    .orderBy(desc(investmentTransactions.executedAt));

  const perpRows = await db
    .select({
      id: hyperCorePerpEvents.id,
      investmentAccountId: hyperCorePerpEvents.investmentAccountId,
      accountLabel: investmentAccounts.label,
      sourceEventId: hyperCorePerpEvents.sourceEventId,
      executedAt: hyperCorePerpEvents.executedAt,
      market: hyperCorePerpEvents.market,
      positionSide: hyperCorePerpEvents.positionSide,
      eventType: hyperCorePerpEvents.eventType,
      baseAssetSymbol: hyperCorePerpEvents.baseAssetSymbol,
      baseAmount: hyperCorePerpEvents.baseAmount,
      entryNotionalUsd: hyperCorePerpEvents.entryNotionalUsd,
      exitNotionalUsd: hyperCorePerpEvents.exitNotionalUsd,
      entryPrice: hyperCorePerpEvents.entryPrice,
      exitPrice: hyperCorePerpEvents.exitPrice,
      grossPnlUsd: hyperCorePerpEvents.grossPnlUsd,
      feeUsd: hyperCorePerpEvents.feeUsd,
      netPnlUsd: hyperCorePerpEvents.netPnlUsd,
    })
    .from(hyperCorePerpEvents)
    .innerJoin(
      investmentAccounts,
      eq(investmentAccounts.id, hyperCorePerpEvents.investmentAccountId),
    )
    .where(eq(hyperCorePerpEvents.userId, userId))
    .orderBy(desc(hyperCorePerpEvents.executedAt));

  const rawTransactions: InvestmentTransactionListItem[] = rawRows.map((row) => ({
    ...row,
    executedAt: row.executedAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
    baseAmount: numberOrNull(row.baseAmount),
    quoteAmount: numberOrNull(row.quoteAmount),
    priceQuote: numberOrNull(row.priceQuote),
    valueUsd: numberOrNull(row.valueUsd),
    feeAmount: numberOrNull(row.feeAmount),
    displayType: "transaction",
  }));

  const perpTransactions: InvestmentTransactionListItem[] = perpRows.map((row) => {
    const eventType = row.eventType as InvestmentTransactionListItem["perpEventType"];
    const positionSide = row.positionSide as InvestmentTransactionListItem["perpPositionSide"];
    const entryNotionalUsd = numberOrNull(row.entryNotionalUsd);
    const exitNotionalUsd = numberOrNull(row.exitNotionalUsd);
    const netPnlUsd = numberOrNull(row.netPnlUsd);

    return {
      id: row.id,
      investmentAccountId: row.investmentAccountId,
      accountLabel: row.accountLabel,
      sourceTransactionId: row.sourceEventId,
      sourceAccountId: null,
      executedAt: row.executedAt.toISOString(),
      settledAt: null,
      kind: "trade",
      side: eventType ?? "unknown",
      baseAssetSymbol: row.baseAssetSymbol,
      baseAssetId: row.market,
      baseAmount: numberOrNull(row.baseAmount),
      quoteAssetSymbol: "USDC",
      quoteAmount: eventType === "open" || eventType === "increase"
        ? entryNotionalUsd
        : exitNotionalUsd,
      priceQuote: eventType === "open" || eventType === "increase"
        ? numberOrNull(row.entryPrice)
        : numberOrNull(row.exitPrice),
      valueUsd: eventType === "open" || eventType === "increase"
        ? entryNotionalUsd
        : netPnlUsd,
      feeAmount: numberOrNull(row.feeUsd),
      feeAssetSymbol: "USDC",
      status: "confirmed",
      displayType: "perp_event",
      perpEventType: eventType,
      perpPositionSide: positionSide,
      entryPrice: numberOrNull(row.entryPrice),
      exitPrice: numberOrNull(row.exitPrice),
      grossPnlUsd: numberOrNull(row.grossPnlUsd),
      netPnlUsd,
    };
  });

  return [...rawTransactions, ...perpTransactions].sort(
    (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
  );
}

export async function getWalletTransactionHistoryStatus(
  userId: string,
  evmAccounts: SavedEvmAccount[],
  hyperCoreAccounts: SavedHyperCoreAccount[],
  lighterAccounts: SavedLighterAccount[] = [],
): Promise<WalletTransactionHistoryStatus> {
  const accountProviders = [
    ...evmAccounts.map((account) => ({ id: account.id, provider: "zerion" })),
    ...hyperCoreAccounts.map((account) => ({ id: account.id, provider: "hyperliquid" })),
    ...lighterAccounts.map((account) => ({ id: account.id, provider: "lighter" })),
  ];
  const transactionScope = and(
    eq(investmentTransactions.userId, userId),
    inArray(investmentTransactions.sourceProvider, WALLET_TRANSACTION_PROVIDERS),
    inArray(investmentTransactions.kind, WALLET_VISIBLE_TRANSACTION_KINDS),
    visibleWalletProviderScope(),
  );
  const [earliest, latest, transactionCount, latestTransactionUpdate, perpEarliest, perpLatest, perpCount, perpLatestUpdate, states] = await Promise.all([
    db.select({ executedAt: investmentTransactions.executedAt }).from(investmentTransactions)
      .where(transactionScope)
      .orderBy(asc(investmentTransactions.executedAt)).limit(1),
    db.select({ executedAt: investmentTransactions.executedAt }).from(investmentTransactions)
      .where(transactionScope)
      .orderBy(desc(investmentTransactions.executedAt)).limit(1),
    db.select({ value: count() }).from(investmentTransactions).where(transactionScope),
    db.select({ value: max(investmentTransactions.updatedAt) })
      .from(investmentTransactions)
      .where(transactionScope),
    db.select({ executedAt: hyperCorePerpEvents.executedAt }).from(hyperCorePerpEvents)
      .where(eq(hyperCorePerpEvents.userId, userId))
      .orderBy(asc(hyperCorePerpEvents.executedAt)).limit(1),
    db.select({ executedAt: hyperCorePerpEvents.executedAt }).from(hyperCorePerpEvents)
      .where(eq(hyperCorePerpEvents.userId, userId))
      .orderBy(desc(hyperCorePerpEvents.executedAt)).limit(1),
    db.select({ value: count() }).from(hyperCorePerpEvents)
      .where(eq(hyperCorePerpEvents.userId, userId)),
    db.select({ value: max(hyperCorePerpEvents.updatedAt) })
      .from(hyperCorePerpEvents)
      .where(eq(hyperCorePerpEvents.userId, userId)),
    Promise.all(accountProviders.map(({ id, provider }) => db.select({
      status: investmentTransactionSyncs.status,
      checkpoint: investmentTransactionSyncs.checkpoint,
      // Keep the expiry comparison in Postgres. These columns are
      // `timestamp without time zone`, so reading them into a JavaScript Date
      // can apply the runtime timezone before determining whether a lease is
      // stale.
      hasActiveLease: sql<boolean>`${investmentTransactionSyncs.leaseExpiresAt} > now()`,
    })
      .from(investmentTransactionSyncs)
      .where(and(eq(investmentTransactionSyncs.userId, userId), eq(investmentTransactionSyncs.investmentAccountId, id), eq(investmentTransactionSyncs.provider, provider)))
      .limit(1))),
  ]);
  const earliestAt = [earliest[0]?.executedAt, perpEarliest[0]?.executedAt]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const latestAt = [latest[0]?.executedAt, perpLatest[0]?.executedAt]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const latestUpdatedAt = [latestTransactionUpdate[0]?.value, perpLatestUpdate[0]?.value]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    transactionCount: (transactionCount[0]?.value ?? 0) + (perpCount[0]?.value ?? 0),
    earliestTransactionAt: earliestAt?.toISOString() ?? null,
    latestTransactionAt: latestAt?.toISOString() ?? null,
    latestTransactionUpdatedAt: latestUpdatedAt?.toISOString() ?? null,
    // A missing row means this account has never been synced, not that a
    // workflow is currently running. Only an active lease should disable the
    // manual sync control and begin polling.
    hasMore: states.some(
      (state) => state[0]?.status === "syncing" && state[0].hasActiveLease,
    ),
    phase: summarizeSyncPhase(states.map((state) => state[0] ?? null)),
  };
}
