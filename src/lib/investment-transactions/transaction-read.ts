import "server-only";

import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import { investmentTransactions } from "@/db/schema/investment-transactions";

import type {
  InvestmentTransactionKind,
  InvestmentTransactionSide,
  InvestmentTransactionStatus,
} from "./ingestion";
import type { TransactionExecutedAtRange } from "./list-item";

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export type ProviderTransactionRow = {
  id: string;
  investmentAccountId: string;
  accountLabel: string | null;
  sourceTransactionId: string;
  sourceAccountId: string | null;
  executedAt: string;
  settledAt: string | null;
  kind: InvestmentTransactionKind;
  side: InvestmentTransactionSide;
  baseAssetSymbol: string | null;
  baseAssetId: string | null;
  baseAmount: number | null;
  quoteAssetSymbol: string | null;
  quoteAmount: number | null;
  priceQuote: number | null;
  valueUsd: number | null;
  feeAmount: number | null;
  feeAssetSymbol: string | null;
  status: InvestmentTransactionStatus;
};

const baseColumns = {
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
} as const;

function shapeProviderTransactionRow<
  T extends {
    executedAt: Date;
    settledAt: Date | null;
    baseAmount: string | null;
    quoteAmount: string | null;
    priceQuote: string | null;
    valueUsd: string | null;
    feeAmount: string | null;
  },
>(row: T) {
  return {
    ...row,
    executedAt: row.executedAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
    baseAmount: numberOrNull(row.baseAmount),
    quoteAmount: numberOrNull(row.quoteAmount),
    priceQuote: numberOrNull(row.priceQuote),
    valueUsd: numberOrNull(row.valueUsd),
    feeAmount: numberOrNull(row.feeAmount),
  };
}

/**
 * Brokerage is the only provider whose transaction read joins a detail
 * table for extra per-row columns, so this join shape is named concretely
 * rather than generalized for a second case that doesn't exist yet.
 */
export type ProviderTransactionDetailJoin = {
  table: PgTable & { transactionId: AnyPgColumn };
  columns: {
    externalAccountId: AnyPgColumn<{ data: string | null }>;
    securityId: AnyPgColumn<{ data: string | null }>;
    plaidType: AnyPgColumn<{ data: string | null }>;
    plaidSubtype: AnyPgColumn<{ data: string | null }>;
    cancelTransactionId: AnyPgColumn<{ data: string | null }>;
  };
};

export type ProviderTransactionBrokerageDetail = {
  externalAccountId: string | null;
  securityId: string | null;
  plaidType: string | null;
  plaidSubtype: string | null;
  cancelTransactionId: string | null;
};

export type ProviderTransactionQuery = {
  userId: string;
  sourceProvider: string;
  range?: TransactionExecutedAtRange;
  /** Brokerage joins its transaction detail table for extra per-row columns. */
  detail?: ProviderTransactionDetailJoin;
};

/**
 * The Kraken and brokerage transaction reads share this join/select shape:
 * an inner join back to `investmentAccounts` scoped by userId and provider,
 * an optional executedAt range, ordered newest-first. Brokerage additionally
 * joins its transaction detail table for extra per-row columns via `detail`.
 */
export function getProviderTransactions(
  query: ProviderTransactionQuery & { detail: ProviderTransactionDetailJoin },
): Promise<(ProviderTransactionRow & ProviderTransactionBrokerageDetail)[]>;
export function getProviderTransactions(
  query: ProviderTransactionQuery & { detail?: undefined },
): Promise<ProviderTransactionRow[]>;
export async function getProviderTransactions(
  query: ProviderTransactionQuery,
): Promise<
  | (ProviderTransactionRow & ProviderTransactionBrokerageDetail)[]
  | ProviderTransactionRow[]
> {
  const where = and(
    eq(investmentTransactions.userId, query.userId),
    eq(investmentTransactions.sourceProvider, query.sourceProvider),
    query.range ? gte(investmentTransactions.executedAt, query.range.start) : undefined,
    query.range ? lt(investmentTransactions.executedAt, query.range.end) : undefined,
  );

  if (query.detail) {
    const rows = await db
      .select({
        ...baseColumns,
        externalAccountId: query.detail.columns.externalAccountId,
        securityId: query.detail.columns.securityId,
        plaidType: query.detail.columns.plaidType,
        plaidSubtype: query.detail.columns.plaidSubtype,
        cancelTransactionId: query.detail.columns.cancelTransactionId,
      })
      .from(investmentTransactions)
      .innerJoin(
        query.detail.table,
        eq(query.detail.table.transactionId, investmentTransactions.id),
      )
      .innerJoin(
        investmentAccounts,
        eq(investmentAccounts.id, investmentTransactions.investmentAccountId),
      )
      .where(where)
      .orderBy(desc(investmentTransactions.executedAt));

    return rows.map((row) => shapeProviderTransactionRow(row));
  }

  const rows = await db
    .select(baseColumns)
    .from(investmentTransactions)
    .innerJoin(
      investmentAccounts,
      eq(investmentAccounts.id, investmentTransactions.investmentAccountId),
    )
    .where(where)
    .orderBy(desc(investmentTransactions.executedAt));

  return rows.map((row) => shapeProviderTransactionRow(row));
}
