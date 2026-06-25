import "server-only";

import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import { investmentTransactionSyncs, investmentTransactions } from "@/db/schema/investment-transactions";
import type { SavedEvmAccount } from "@/lib/evm/accounts";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";
import { summarizeSyncPhase, type TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

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

export async function getCurrentWalletTransactions(userId: string): Promise<InvestmentTransactionListItem[]> {
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
    .where(and(eq(investmentTransactions.userId, userId), inArray(investmentTransactions.sourceProvider, ["hyperliquid", "zerion"])))
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

export async function getWalletTransactionHistoryStatus(
  userId: string,
  evmAccounts: SavedEvmAccount[],
  hyperCoreAccounts: SavedHyperCoreAccount[],
): Promise<WalletTransactionHistoryStatus> {
  const accountProviders = [
    ...evmAccounts.map((account) => ({ id: account.id, provider: "zerion" })),
    ...hyperCoreAccounts.map((account) => ({ id: account.id, provider: "hyperliquid" })),
  ];
  const transactionScope = and(
    eq(investmentTransactions.userId, userId),
    inArray(investmentTransactions.sourceProvider, ["hyperliquid", "zerion"]),
  );
  const [earliest, latest, transactionCount, latestTransactionUpdate, states] = await Promise.all([
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
  return {
    transactionCount: transactionCount[0]?.value ?? 0,
    earliestTransactionAt: earliest[0]?.executedAt.toISOString() ?? null,
    latestTransactionAt: latest[0]?.executedAt.toISOString() ?? null,
    latestTransactionUpdatedAt:
      latestTransactionUpdate[0]?.value?.toISOString() ?? null,
    // A missing row means this account has never been synced, not that a
    // workflow is currently running. Only an active lease should disable the
    // manual sync control and begin polling.
    hasMore: states.some(
      (state) => state[0]?.status === "syncing" && state[0].hasActiveLease,
    ),
    phase: summarizeSyncPhase(states.map((state) => state[0] ?? null)),
  };
}
