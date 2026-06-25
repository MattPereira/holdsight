import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import type { InvestmentTransaction, Security } from "plaid";

import { db } from "@/db";
import {
  brokerageAccounts,
  investmentAccounts,
} from "@/db/schema/investment-accounts";
import {
  brokerageTransactionDetails,
  investmentTransactionSyncs,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import type { SavedBrokerageAccount } from "@/lib/brokerage/accounts";
import { getInvestmentTransactionsPage } from "@/lib/brokerage/client";
import type { BrokerageTransactionsPageResult } from "@/lib/brokerage/types";
import {
  getInvestmentTransactionSyncState,
  saveInvestmentTransactionPage,
  upsertInvestmentTransactionSyncState,
  type InvestmentTransactionKind,
  type InvestmentTransactionSide,
  type InvestmentTransactionStatus,
  type NormalizedBrokerageTransactionDetails,
  type NormalizedInvestmentTransaction,
} from "@/lib/investment-transactions/ingestion";
import { decrypt } from "@/lib/plaid/crypto";
import { getUserBrokeragePlaidItems } from "@/lib/plaid/items";

const PLAID_PROVIDER = "plaid";
const PLAID_HISTORY_LOOKBACK_DAYS = 730;
const INCREMENTAL_SYNC_OVERLAP_DAYS = 7;

export type CurrentBrokerageTransaction = {
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
  externalAccountId: string | null;
  securityId: string | null;
  plaidType: string | null;
  plaidSubtype: string | null;
  cancelTransactionId: string | null;
};

type BrokeragePageCursor = {
  startDate: string;
  endDate: string;
  offset: number;
};

type BrokerageTransactionCheckpoint =
  | { version: 1; phase: "backfilling" | "forward_sync"; page: BrokeragePageCursor }
  | { version: 1; phase: "up_to_date"; scannedThroughDate: string };

export type BrokerageTransactionSyncPageResult = {
  transactionCount: number;
  phase: BrokerageTransactionCheckpoint["phase"] | "error";
  shouldContinue: boolean;
  itemSyncStatus: "rate_limited" | "error" | null;
};

export type BrokerageTransactionImportStatus = {
  isSyncing: boolean;
};

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function transactionDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPageCursor(value: unknown): value is BrokeragePageCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<BrokeragePageCursor>;
  return (
    isDateOnly(cursor.startDate) &&
    isDateOnly(cursor.endDate) &&
    typeof cursor.offset === "number" &&
    Number.isInteger(cursor.offset) &&
    cursor.offset >= 0
  );
}

function isBrokerageTransactionCheckpoint(
  value: Record<string, unknown> | null,
): value is BrokerageTransactionCheckpoint {
  if (!value || value.version !== 1) return false;
  if (value.phase === "backfilling" || value.phase === "forward_sync") {
    return isPageCursor(value.page);
  }
  return value.phase === "up_to_date" && isDateOnly(value.scannedThroughDate);
}

function initialCheckpoint(endDate: string): BrokerageTransactionCheckpoint {
  return {
    version: 1,
    phase: "backfilling",
    page: {
      startDate: dateOnly(subtractDays(transactionDate(endDate), PLAID_HISTORY_LOOKBACK_DAYS)),
      endDate,
      offset: 0,
    },
  };
}

function currencySymbol(transaction: InvestmentTransaction): string {
  return transaction.iso_currency_code ?? transaction.unofficial_currency_code ?? "USD";
}

function executedAt(transaction: InvestmentTransaction): Date {
  return transaction.transaction_datetime
    ? new Date(transaction.transaction_datetime)
    : transactionDate(transaction.date);
}

function settledAt(transaction: InvestmentTransaction): Date | null {
  return transaction.transaction_datetime ? transactionDate(transaction.date) : null;
}

function securitySymbol(
  transaction: InvestmentTransaction,
  security: Security | undefined,
): string {
  if (!transaction.security_id) return currencySymbol(transaction);
  return security?.ticker_symbol ?? security?.name ?? transaction.security_id;
}

function transactionKind(transaction: InvestmentTransaction): InvestmentTransactionKind {
  const { type, subtype } = transaction;
  if (type === "buy" || type === "sell") return "trade";
  if (type === "fee") return "fee";
  if (type === "transfer") return "transfer";
  if (type === "cancel") return "adjustment";
  if (subtype.includes("dividend") || subtype.includes("capital gain")) return "dividend";
  if (subtype.includes("interest")) return "interest";
  if (subtype === "deposit" || subtype === "contribution") return "deposit";
  if (subtype === "withdrawal" || subtype === "distribution") return "withdrawal";
  if (type === "cash") return "adjustment";
  return "unknown";
}

function transactionSide(transaction: InvestmentTransaction): InvestmentTransactionSide {
  const { subtype } = transaction;
  if (transaction.type === "buy" || subtype === "buy to cover") return "buy";
  if (transaction.type === "sell" || subtype === "sell short") return "sell";
  if (
    subtype === "deposit" || subtype === "contribution" ||
    subtype.includes("dividend") || subtype.includes("interest") || subtype.includes("capital gain")
  ) return "receive";
  if (subtype === "withdrawal" || subtype === "distribution" || subtype === "send") return "send";
  return "unknown";
}

function transactionStatus(transaction: InvestmentTransaction): InvestmentTransactionStatus {
  if (transaction.type === "cancel") return "canceled";
  if (transaction.subtype === "pending credit" || transaction.subtype === "pending debit") return "pending";
  return "confirmed";
}

function normalizePlaidTransaction(
  transaction: InvestmentTransaction,
  security: Security | undefined,
): NormalizedInvestmentTransaction {
  return {
    sourceProvider: PLAID_PROVIDER,
    sourceTransactionId: transaction.investment_transaction_id,
    sourceAccountId: transaction.account_id,
    executedAt: executedAt(transaction),
    settledAt: settledAt(transaction),
    kind: transactionKind(transaction),
    side: transactionSide(transaction),
    baseAssetSymbol: securitySymbol(transaction, security),
    baseAssetId: transaction.security_id,
    baseAmount: transaction.quantity,
    quoteAssetSymbol: currencySymbol(transaction),
    quoteAmount: transaction.amount,
    priceQuote: transaction.price,
    valueUsd: Math.abs(transaction.amount),
    feeAmount: transaction.fees,
    feeAssetSymbol: transaction.fees ? currencySymbol(transaction) : null,
    status: transactionStatus(transaction),
    raw: { transaction, security: security ?? null },
  };
}

function normalizeBrokerageDetails(
  plaidItemId: string,
  transaction: InvestmentTransaction,
): NormalizedBrokerageTransactionDetails {
  return {
    sourceTransactionId: transaction.investment_transaction_id,
    plaidItemId,
    externalAccountId: transaction.account_id,
    securityId: transaction.security_id,
    plaidType: transaction.type,
    plaidSubtype: transaction.subtype,
    cancelTransactionId: transaction.cancel_transaction_id,
  };
}

function errorDetails(result: Exclude<BrokerageTransactionsPageResult, { status: "ready" }>) {
  if (result.status === "error") {
    return { status: result.httpStatus === 429 ? "rate_limited" as const : "error" as const, message: result.message, httpStatus: result.httpStatus };
  }
  if (result.status === "login_required") {
    return { status: "error" as const, message: "Plaid needs you to finish signing in.", httpStatus: null };
  }
  return { status: "error" as const, message: "Plaid is still preparing investment transactions.", httpStatus: null };
}

async function getBrokeragePlaidItem(userId: string, account: SavedBrokerageAccount) {
  if (!account.plaidItemId || !account.externalAccountId) {
    throw new Error("Brokerage account is missing its Plaid connection.");
  }
  const item = (await getUserBrokeragePlaidItems(userId)).find(
    (candidate) => candidate.id === account.plaidItemId,
  );
  if (!item) throw new Error("Plaid Item no longer exists.");
  return { item, externalAccountId: account.externalAccountId };
}

export async function getBrokerageTransactionImportStatus(
  userId: string,
): Promise<BrokerageTransactionImportStatus> {
  const [active] = await db
    .select({ id: investmentTransactionSyncs.id })
    .from(investmentTransactionSyncs)
    .innerJoin(
      brokerageAccounts,
      eq(
        brokerageAccounts.investmentAccountId,
        investmentTransactionSyncs.investmentAccountId,
      ),
    )
    .where(
      and(
        eq(investmentTransactionSyncs.userId, userId),
        eq(investmentTransactionSyncs.provider, PLAID_PROVIDER),
        eq(investmentTransactionSyncs.status, "syncing"),
        sql`${investmentTransactionSyncs.leaseExpiresAt} > now()`,
      ),
    )
    .limit(1);

  return { isSyncing: Boolean(active) };
}

/** Advances one durable, account-scoped Plaid transaction page. */
export async function processBrokerageTransactionSyncPage(input: {
  userId: string;
  account: SavedBrokerageAccount;
}): Promise<BrokerageTransactionSyncPageResult> {
  const state = await getInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.account.id,
    provider: PLAID_PROVIDER,
  });
  const { item, externalAccountId } = await getBrokeragePlaidItem(input.userId, input.account);
  const today = dateOnly(new Date());
  const storedCheckpoint = state?.checkpoint ?? null;
  const checkpoint: BrokerageTransactionCheckpoint = isBrokerageTransactionCheckpoint(storedCheckpoint)
    ? storedCheckpoint
    : initialCheckpoint(today);
  const page = checkpoint.phase === "up_to_date"
    ? {
        startDate: dateOnly(subtractDays(transactionDate(checkpoint.scannedThroughDate), INCREMENTAL_SYNC_OVERLAP_DAYS)),
        endDate: today,
        offset: 0,
      }
    : checkpoint.page;
  const result = await getInvestmentTransactionsPage(
    decrypt(item.accessTokenEncrypted),
    { ...page, accountId: externalAccountId },
  );

  if (result.status !== "ready") {
    const error = errorDetails(result);
    await upsertInvestmentTransactionSyncState({
      userId: input.userId,
      investmentAccountId: input.account.id,
      provider: PLAID_PROVIDER,
      status: error.status,
      checkpoint,
      earliestBackfilledAt: state?.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt: state?.latestSyncedExecutedAt ?? null,
      backfillStartedAt: state?.backfillStartedAt ?? null,
      backfillCompletedAt: state?.backfillCompletedAt ?? null,
      lastSyncedAt: new Date(),
      lastHttpStatus: error.httpStatus,
      lastErrorMessage: error.message,
    });
    return {
      transactionCount: 0,
      phase: "error",
      shouldContinue: false,
      itemSyncStatus: error.status,
    };
  }

  const securities = new Map(result.securities.map((security) => [security.security_id, security]));
  const transactions = result.transactions.filter(
    (transaction) => transaction.account_id === externalAccountId,
  );
  const nextOffset = page.offset + result.transactions.length;
  const hasMore = nextOffset < result.totalInvestmentTransactions;
  const nextCheckpoint: BrokerageTransactionCheckpoint = hasMore
    ? {
        version: 1,
        phase: checkpoint.phase === "up_to_date" ? "forward_sync" : checkpoint.phase,
        page: { ...page, offset: nextOffset },
      }
    : { version: 1, phase: "up_to_date", scannedThroughDate: page.endDate };
  const now = new Date();
  const saved = await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions: transactions.map((transaction) => normalizePlaidTransaction(transaction, transaction.security_id ? securities.get(transaction.security_id) : undefined)),
      brokerageDetails: transactions.map((transaction) => normalizeBrokerageDetails(item.id, transaction)),
    },
    syncState: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      provider: PLAID_PROVIDER,
      status: hasMore ? "syncing" : "success",
      checkpoint: nextCheckpoint,
      earliestBackfilledAt: state?.earliestBackfilledAt ?? transactionDate(page.startDate),
      latestSyncedExecutedAt: hasMore ? state?.latestSyncedExecutedAt ?? null : transactionDate(page.endDate),
      backfillStartedAt: state?.backfillStartedAt ?? now,
      backfillCompletedAt: hasMore ? state?.backfillCompletedAt ?? null : now,
      lastSyncedAt: now,
      lastHttpStatus: null,
      lastErrorMessage: null,
    },
  });

  return {
    transactionCount: saved.transactions.transactionCount,
    phase: nextCheckpoint.phase,
    shouldContinue: hasMore,
    itemSyncStatus: null,
  };
}

export async function getCurrentBrokerageTransactions(
  userId: string,
): Promise<CurrentBrokerageTransaction[]> {
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
      externalAccountId: brokerageTransactionDetails.externalAccountId,
      securityId: brokerageTransactionDetails.securityId,
      plaidType: brokerageTransactionDetails.plaidType,
      plaidSubtype: brokerageTransactionDetails.plaidSubtype,
      cancelTransactionId: brokerageTransactionDetails.cancelTransactionId,
    })
    .from(investmentTransactions)
    .innerJoin(brokerageTransactionDetails, eq(brokerageTransactionDetails.transactionId, investmentTransactions.id))
    .innerJoin(investmentAccounts, eq(investmentAccounts.id, investmentTransactions.investmentAccountId))
    .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, PLAID_PROVIDER)))
    .orderBy(desc(investmentTransactions.executedAt));

  return rows.map((row) => ({
    ...row,
    executedAt: row.executedAt.toISOString(),
    settledAt: isoOrNull(row.settledAt),
    baseAmount: numberOrNull(row.baseAmount),
    quoteAmount: numberOrNull(row.quoteAmount),
    priceQuote: numberOrNull(row.priceQuote),
    valueUsd: numberOrNull(row.valueUsd),
    feeAmount: numberOrNull(row.feeAmount),
  }));
}
