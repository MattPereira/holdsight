import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { InvestmentTransaction, Security } from "plaid";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import {
  brokerageTransactionDetails,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import {
  getItemAccountLinks,
  type ItemAccountLink,
} from "@/lib/brokerage/accounts";
import { getInvestmentTransactions } from "@/lib/brokerage/client";
import type { BrokerageTransactionsResult } from "@/lib/brokerage/types";
import {
  getInvestmentTransactionSyncState,
  upsertInvestmentTransactions,
  upsertInvestmentTransactionSyncState,
  type InvestmentTransactionSyncState,
  type InvestmentTransactionKind,
  type InvestmentTransactionSide,
  type InvestmentTransactionStatus,
  type NormalizedBrokerageTransactionDetails,
  type NormalizedInvestmentTransaction,
} from "@/lib/investment-transactions/ingestion";
import { decrypt } from "@/lib/plaid/crypto";
import {
  getUserBrokeragePlaidItems,
  type SavedPlaidItem,
} from "@/lib/plaid/items";

const PLAID_PROVIDER = "plaid";
const INITIAL_SYNC_LOOKBACK_MONTHS = 1;
const INCREMENTAL_SYNC_OVERLAP_DAYS = 7;

export type ApplyItemInvestmentTransactionsResult =
  | {
      status: "ready";
      transactionCount: number;
      brokerageDetailCount: number;
      skippedTransactionCount: number;
    }
  | { status: "login_required" }
  | { status: "not_ready" }
  | { status: "error"; message: string; httpStatus: number };

export type SyncUserBrokerageInvestmentTransactionsResult = {
  itemCount: number;
  transactionCount: number;
  brokerageDetailCount: number;
  skippedTransactionCount: number;
  failures: Array<{
    plaidItemId: string;
    status: Exclude<ApplyItemInvestmentTransactionsResult["status"], "ready">;
    message?: string;
    httpStatus?: number;
  }>;
};

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

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export async function getCurrentBrokerageTransactions(
  userId: string,
  limit = 200,
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
    .innerJoin(
      brokerageTransactionDetails,
      eq(brokerageTransactionDetails.transactionId, investmentTransactions.id),
    )
    .innerJoin(
      investmentAccounts,
      eq(investmentAccounts.id, investmentTransactions.investmentAccountId),
    )
    .where(
      and(
        eq(investmentTransactions.userId, userId),
        eq(investmentTransactions.sourceProvider, PLAID_PROVIDER),
      ),
    )
    .orderBy(desc(investmentTransactions.executedAt))
    .limit(limit);

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

function currencySymbol(transaction: InvestmentTransaction): string {
  return (
    transaction.iso_currency_code ??
    transaction.unofficial_currency_code ??
    "USD"
  );
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

function defaultStartDate(endDate: string): string {
  const start = transactionDate(endDate);
  start.setUTCMonth(start.getUTCMonth() - INITIAL_SYNC_LOOKBACK_MONTHS);
  return dateOnly(start);
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

  return (
    security?.ticker_symbol ??
    security?.name ??
    transaction.security_id
  );
}

function transactionKind(
  transaction: InvestmentTransaction,
): InvestmentTransactionKind {
  const type = transaction.type;
  const subtype = transaction.subtype;

  if (type === "buy" || type === "sell") return "trade";
  if (type === "fee") return "fee";
  if (type === "transfer") return "transfer";
  if (type === "cancel") return "adjustment";
  if (subtype.includes("dividend") || subtype.includes("capital gain")) {
    return "dividend";
  }
  if (subtype.includes("interest")) return "interest";
  if (subtype === "deposit" || subtype === "contribution") return "deposit";
  if (subtype === "withdrawal" || subtype === "distribution") {
    return "withdrawal";
  }
  if (type === "cash") return "adjustment";

  return "unknown";
}

function transactionSide(
  transaction: InvestmentTransaction,
): InvestmentTransactionSide {
  const subtype = transaction.subtype;

  if (transaction.type === "buy" || subtype === "buy to cover") return "buy";
  if (transaction.type === "sell" || subtype === "sell short") return "sell";
  if (
    subtype === "deposit" ||
    subtype === "contribution" ||
    subtype.includes("dividend") ||
    subtype.includes("interest") ||
    subtype.includes("capital gain")
  ) {
    return "receive";
  }
  if (
    subtype === "withdrawal" ||
    subtype === "distribution" ||
    subtype === "send"
  ) {
    return "send";
  }

  return "unknown";
}

function transactionStatus(
  transaction: InvestmentTransaction,
): InvestmentTransactionStatus {
  if (transaction.type === "cancel") return "canceled";
  if (transaction.subtype === "pending credit" || transaction.subtype === "pending debit") {
    return "pending";
  }

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
    raw: {
      transaction,
      security: security ? {
        security_id: security.security_id,
        ticker_symbol: security.ticker_symbol,
        name: security.name,
        type: security.type,
        subtype: security.subtype,
        iso_currency_code: security.iso_currency_code,
        unofficial_currency_code: security.unofficial_currency_code,
      } : null,
    },
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

function securitiesById(securities: Security[]): Map<string, Security> {
  return new Map(
    securities.map((security) => [security.security_id, security]),
  );
}

function resultError(
  result: Exclude<BrokerageTransactionsResult, { status: "ready" }>,
): ApplyItemInvestmentTransactionsResult {
  if (result.status === "error") return result;
  return { status: result.status };
}

function resultErrorMessage(
  result: Exclude<BrokerageTransactionsResult, { status: "ready" }>,
): { message: string | null; httpStatus: number | null } {
  if (result.status === "error") {
    return { message: result.message, httpStatus: result.httpStatus };
  }
  if (result.status === "login_required") {
    return {
      message: "Plaid needs you to finish signing in.",
      httpStatus: null,
    };
  }
  return {
    message: "Plaid is still preparing investment transactions.",
    httpStatus: null,
  };
}

function maxDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((latest, date) => date > latest ? date : latest);
}

function minDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((earliest, date) => date < earliest ? date : earliest);
}

async function syncStatesByInvestmentAccountId(
  userId: string,
  links: ItemAccountLink[],
): Promise<Map<string, InvestmentTransactionSyncState | null>> {
  const entries = await Promise.all(
    links.map(async (link) => [
      link.investmentAccountId,
      await getInvestmentTransactionSyncState({
        userId,
        investmentAccountId: link.investmentAccountId,
        provider: PLAID_PROVIDER,
      }),
    ] as const),
  );

  return new Map(entries);
}

function fetchStartDate(input: {
  endDate: string;
  states: Map<string, InvestmentTransactionSyncState | null>;
}): string {
  const fallback = defaultStartDate(input.endDate);
  const starts = Array.from(input.states.values()).map((state) =>
    state?.latestSyncedExecutedAt
      ? subtractDays(
          state.latestSyncedExecutedAt,
          INCREMENTAL_SYNC_OVERLAP_DAYS,
        )
      : transactionDate(fallback),
  );

  return dateOnly(minDate(starts) ?? transactionDate(fallback));
}

function stateEarliestBackfilledAt(input: {
  state: InvestmentTransactionSyncState | null;
  startDate: string;
}): Date {
  const start = transactionDate(input.startDate);
  if (!input.state?.earliestBackfilledAt) return start;
  return input.state.earliestBackfilledAt < start
    ? input.state.earliestBackfilledAt
    : start;
}

async function markSyncSuccess(input: {
  userId: string;
  links: ItemAccountLink[];
  states: Map<string, InvestmentTransactionSyncState | null>;
  transactions: InvestmentTransaction[];
  startDate: string;
  endDate: string;
}): Promise<void> {
  const now = new Date();
  const end = transactionDate(input.endDate);
  const transactionsByAccountId = new Map<string, InvestmentTransaction[]>();

  for (const transaction of input.transactions) {
    const current = transactionsByAccountId.get(transaction.account_id) ?? [];
    current.push(transaction);
    transactionsByAccountId.set(transaction.account_id, current);
  }

  for (const link of input.links) {
    const state = input.states.get(link.investmentAccountId) ?? null;
    const accountTransactions =
      transactionsByAccountId.get(link.externalAccountId) ?? [];
    const latestTransactionExecutedAt = maxDate(
      accountTransactions.map(executedAt),
    );
    const latestSyncedExecutedAt = maxDate([
      state?.latestSyncedExecutedAt,
      latestTransactionExecutedAt,
      end,
    ].filter((date): date is Date => Boolean(date)));

    await upsertInvestmentTransactionSyncState({
      userId: input.userId,
      investmentAccountId: link.investmentAccountId,
      provider: PLAID_PROVIDER,
      status: "success",
      checkpoint: state?.checkpoint ?? null,
      earliestBackfilledAt: stateEarliestBackfilledAt({
        state,
        startDate: input.startDate,
      }),
      latestSyncedExecutedAt,
      backfillStartedAt: state?.backfillStartedAt ?? now,
      backfillCompletedAt: now,
      lastSyncedAt: now,
      lastHttpStatus: null,
      lastErrorMessage: null,
    });
  }
}

async function markSyncFailure(input: {
  userId: string;
  links: ItemAccountLink[];
  states: Map<string, InvestmentTransactionSyncState | null>;
  result: Exclude<BrokerageTransactionsResult, { status: "ready" }>;
}): Promise<void> {
  const now = new Date();
  const error = resultErrorMessage(input.result);
  const status =
    input.result.status === "error" && input.result.httpStatus === 429
      ? "rate_limited"
      : "error";

  for (const link of input.links) {
    const state = input.states.get(link.investmentAccountId) ?? null;
    await upsertInvestmentTransactionSyncState({
      userId: input.userId,
      investmentAccountId: link.investmentAccountId,
      provider: PLAID_PROVIDER,
      status,
      checkpoint: state?.checkpoint ?? null,
      earliestBackfilledAt: state?.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt: state?.latestSyncedExecutedAt ?? null,
      backfillStartedAt: state?.backfillStartedAt ?? null,
      backfillCompletedAt: state?.backfillCompletedAt ?? null,
      lastSyncedAt: now,
      lastHttpStatus: error.httpStatus,
      lastErrorMessage: error.message,
    });
  }
}

export async function applyItemInvestmentTransactions(
  userId: string,
  plaidItemId: string,
  result: BrokerageTransactionsResult,
): Promise<ApplyItemInvestmentTransactionsResult> {
  if (result.status !== "ready") return resultError(result);

  const links = await getItemAccountLinks(plaidItemId);
  const investmentAccountIdByExternal = new Map(
    links.map((link) => [link.externalAccountId, link.investmentAccountId]),
  );
  const securities = securitiesById(result.securities);
  const transactionsByInvestmentAccountId = new Map<
    string,
    {
      transactions: NormalizedInvestmentTransaction[];
      brokerageDetails: NormalizedBrokerageTransactionDetails[];
    }
  >();
  let skippedTransactionCount = 0;

  for (const transaction of result.transactions) {
    const investmentAccountId = investmentAccountIdByExternal.get(
      transaction.account_id,
    );

    if (!investmentAccountId) {
      skippedTransactionCount += 1;
      continue;
    }

    const group = transactionsByInvestmentAccountId.get(investmentAccountId) ?? {
      transactions: [],
      brokerageDetails: [],
    };

    group.transactions.push(
      normalizePlaidTransaction(
        transaction,
        transaction.security_id
          ? securities.get(transaction.security_id)
          : undefined,
      ),
    );
    group.brokerageDetails.push(
      normalizeBrokerageDetails(plaidItemId, transaction),
    );
    transactionsByInvestmentAccountId.set(investmentAccountId, group);
  }

  let transactionCount = 0;
  let brokerageDetailCount = 0;
  for (const [investmentAccountId, group] of transactionsByInvestmentAccountId) {
    const upsertResult = await upsertInvestmentTransactions({
      userId,
      investmentAccountId,
      transactions: group.transactions,
      brokerageDetails: group.brokerageDetails,
    });
    transactionCount += upsertResult.transactionCount;
    brokerageDetailCount += upsertResult.brokerageDetailCount;
  }

  return {
    status: "ready",
    transactionCount,
    brokerageDetailCount,
    skippedTransactionCount,
  };
}

export async function syncPlaidItemInvestmentTransactions(
  userId: string,
  item: SavedPlaidItem,
  input: {
    endDate: string;
    startDate?: string;
  },
): Promise<ApplyItemInvestmentTransactionsResult> {
  const links = await getItemAccountLinks(item.id);
  if (links.length === 0) {
    return {
      status: "ready",
      transactionCount: 0,
      brokerageDetailCount: 0,
      skippedTransactionCount: 0,
    };
  }

  const states = await syncStatesByInvestmentAccountId(userId, links);
  const startDate = input.startDate ?? fetchStartDate({
    endDate: input.endDate,
    states,
  });
  const accessToken = decrypt(item.accessTokenEncrypted);
  const result = await getInvestmentTransactions(accessToken, {
    startDate,
    endDate: input.endDate,
    accountIds: links.map((link) => link.externalAccountId),
  });

  if (result.status !== "ready") {
    await markSyncFailure({ userId, links, states, result });
    return resultError(result);
  }

  const applied = await applyItemInvestmentTransactions(userId, item.id, result);
  await markSyncSuccess({
    userId,
    links,
    states,
    transactions: result.transactions,
    startDate,
    endDate: input.endDate,
  });
  return applied;
}

export async function syncUserBrokerageInvestmentTransactions(
  userId: string,
  input: {
    endDate: string;
    startDate?: string;
  },
): Promise<SyncUserBrokerageInvestmentTransactionsResult> {
  const items = await getUserBrokeragePlaidItems(userId);
  const summary: SyncUserBrokerageInvestmentTransactionsResult = {
    itemCount: items.length,
    transactionCount: 0,
    brokerageDetailCount: 0,
    skippedTransactionCount: 0,
    failures: [],
  };

  for (const item of items) {
    const result = await syncPlaidItemInvestmentTransactions(userId, item, input);

    if (result.status === "ready") {
      summary.transactionCount += result.transactionCount;
      summary.brokerageDetailCount += result.brokerageDetailCount;
      summary.skippedTransactionCount += result.skippedTransactionCount;
      continue;
    }

    const failure = resultErrorMessage(result);
    summary.failures.push({
      plaidItemId: item.id,
      status: result.status,
      ...(failure.message ? { message: failure.message } : {}),
      ...(failure.httpStatus ? { httpStatus: failure.httpStatus } : {}),
    });
  }

  return summary;
}
