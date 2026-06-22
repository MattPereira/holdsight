import "server-only";

import type { InvestmentTransaction, Security } from "plaid";

import { getItemAccountLinks } from "@/lib/brokerage/accounts";
import { getInvestmentTransactions } from "@/lib/brokerage/client";
import type { BrokerageTransactionsResult } from "@/lib/brokerage/types";
import {
  upsertInvestmentTransactions,
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
    startDate: string;
    endDate: string;
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

  const accessToken = decrypt(item.accessTokenEncrypted);
  const result = await getInvestmentTransactions(accessToken, {
    startDate: input.startDate,
    endDate: input.endDate,
    accountIds: links.map((link) => link.externalAccountId),
  });

  return applyItemInvestmentTransactions(userId, item.id, result);
}

export async function syncUserBrokerageInvestmentTransactions(
  userId: string,
  input: {
    startDate: string;
    endDate: string;
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

    summary.failures.push({
      plaidItemId: item.id,
      status: result.status,
      ...(result.status === "error"
        ? { message: result.message, httpStatus: result.httpStatus }
        : {}),
    });
  }

  return summary;
}
