import "server-only";

import { getWalletTransactionsPage, type ZerionTransaction, type ZerionTransfer } from "@/lib/evm/client";
import type { SavedEvmAccount } from "@/lib/evm/accounts";
import {
  getInvestmentTransactionSyncState,
  saveInvestmentTransactionPage,
  type InvestmentTransactionKind,
  type InvestmentTransactionSide,
  type NormalizedEvmTransactionDetails,
  type NormalizedInvestmentTransaction,
} from "@/lib/investment-transactions/ingestion";

const ZERION_PROVIDER = "zerion";

type ZerionCheckpoint = { version: 1; next: string | null; completed?: boolean };
const INCREMENTAL_SYNC_OVERLAP_MS = 24 * 60 * 60 * 1_000;
const APPROVAL_OPERATIONS = new Set([
  "approve",
  "increase_allowance",
  "decrease_allowance",
  "set_approval_for_all",
]);
const APPROVAL_METHODS = new Set([
  "approve",
  "increaseallowance",
  "decreaseallowance",
  "setapprovalforall",
  "permit",
]);

function checkpoint(value: unknown): ZerionCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ZerionCheckpoint>;
  return candidate.version === 1 && (typeof candidate.next === "string" || candidate.next === null)
    ? candidate as ZerionCheckpoint
    : null;
}

function transactionKind(operation: string | undefined): InvestmentTransactionKind {
  if (operation === "trade") return "trade";
  if (operation === "deposit") return "deposit";
  if (operation === "withdraw") return "withdrawal";
  return "transfer";
}

function transferDirection(transfer: ZerionTransfer, address: string): "in" | "out" | null {
  const normalized = address.toLowerCase();
  if (transfer.direction === "in") return "in";
  if (transfer.direction === "out") return "out";
  if (transfer.recipient?.toLowerCase() === normalized) return "in";
  if (transfer.sender?.toLowerCase() === normalized) return "out";
  return null;
}

function quantityOf(transfer: ZerionTransfer | null): string | number | null {
  return transfer?.quantity?.numeric ?? transfer?.quantity?.float ?? null;
}

function normalizedOperation(value: string | undefined): string {
  return value?.trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_") ?? "";
}

function normalizedMethod(value: string | undefined): string {
  return value?.trim().toLowerCase().replaceAll(/[\s_-]/g, "") ?? "";
}

function isApprovalTransaction(transaction: ZerionTransaction): boolean {
  const attributes = transaction.attributes;
  return (
    APPROVAL_OPERATIONS.has(normalizedOperation(attributes.operation_type)) ||
    APPROVAL_METHODS.has(normalizedMethod(attributes.application_metadata?.method?.name))
  );
}

function normalized(transaction: ZerionTransaction, account: SavedEvmAccount): NormalizedInvestmentTransaction {
  const attributes = transaction.attributes;
  const transfers = attributes.transfers ?? [];
  const incoming = transfers.find((transfer) => transferDirection(transfer, account.address) === "in") ?? null;
  const outgoing = transfers.find((transfer) => transferDirection(transfer, account.address) === "out") ?? null;
  const isTrade = attributes.operation_type === "trade";

  // A swap moves two assets: capture the received token as the base leg and the
  // sent token as the quote leg so the UI can show both sides. Anything else is
  // a single movement; use whichever transfer touches the wallet.
  const primary = incoming ?? outgoing ?? transfers[0] ?? null;
  const baseTransfer = isTrade ? incoming ?? primary : primary;
  const quoteTransfer = isTrade ? outgoing : null;
  const side: InvestmentTransactionSide = isTrade
    ? "swap"
    : primary && transferDirection(primary, account.address) === "out"
      ? "send"
      : primary
        ? "receive"
        : "unknown";

  return {
    sourceProvider: ZERION_PROVIDER,
    sourceTransactionId: transaction.id,
    sourceAccountId: account.address,
    executedAt: new Date(attributes.mined_at ?? Date.now()),
    kind: transactionKind(attributes.operation_type),
    side,
    baseAssetSymbol: baseTransfer?.fungible_info?.symbol ?? attributes.operation_type ?? null,
    baseAssetId: baseTransfer?.fungible_info?.id ?? null,
    baseAmount: quantityOf(baseTransfer),
    quoteAssetSymbol: quoteTransfer?.fungible_info?.symbol ?? null,
    quoteAssetId: quoteTransfer?.fungible_info?.id ?? null,
    quoteAmount: quantityOf(quoteTransfer),
    valueUsd: baseTransfer?.value ?? quoteTransfer?.value ?? null,
    priceQuote: baseTransfer?.price ?? null,
    feeAmount: attributes.fee?.quantity?.numeric ?? attributes.fee?.quantity?.float ?? null,
    feeAssetSymbol: attributes.fee?.fungible_info?.symbol ?? null,
    chainId: transaction.relationships?.chain?.data?.id ?? null,
    txHash: attributes.hash ?? null,
    status: attributes.status === "confirmed" ? "confirmed" : attributes.status === "failed" ? "failed" : "unknown",
    raw: transaction,
  };
}

function detail(transaction: ZerionTransaction): NormalizedEvmTransactionDetails {
  const attributes = transaction.attributes;
  return {
    sourceTransactionId: transaction.id,
    chainId: transaction.relationships?.chain?.data?.id ?? "unknown",
    txHash: attributes.hash ?? transaction.id,
    blockNumber: attributes.mined_at_block ?? null,
    protocol: attributes.application_metadata?.name ?? null,
    method: attributes.application_metadata?.method?.name ?? null,
    fromAddress: attributes.sent_from ?? null,
    toAddress: attributes.sent_to ?? null,
  };
}

export async function processEvmTransactionSyncPage(input: {
  userId: string;
  account: SavedEvmAccount;
}): Promise<{ transactionCount: number; shouldContinue: boolean }> {
  const state = await getInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.account.id,
    provider: ZERION_PROVIDER,
  });
  const existing = checkpoint(state?.checkpoint);
  const page = await getWalletTransactionsPage({
    address: input.account.address,
    next: existing?.next,
    minMinedAt: existing?.completed ? Date.now() - INCREMENTAL_SYNC_OVERLAP_MS : undefined,
  });
  const now = new Date();
  if (page.status !== "ready") {
    await saveInvestmentTransactionPage({
      transactions: { userId: input.userId, investmentAccountId: input.account.id, transactions: [] },
      syncState: {
        userId: input.userId, investmentAccountId: input.account.id, provider: ZERION_PROVIDER,
        status: page.status, checkpoint: existing, lastSyncedAt: now,
        lastHttpStatus: page.httpStatus, lastErrorMessage: page.status === "error" ? page.message : "Zerion rate limit reached.",
      },
    });
    return { transactionCount: 0, shouldContinue: false };
  }

  const nextCheckpoint: ZerionCheckpoint = { version: 1, next: page.next, completed: !page.next };
  const transactions = page.transactions.filter((transaction) => !isApprovalTransaction(transaction));
  const saved = await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions: transactions.map((transaction) => normalized(transaction, input.account)),
      evmDetails: transactions.map(detail),
    },
    syncState: {
      userId: input.userId, investmentAccountId: input.account.id, provider: ZERION_PROVIDER,
      status: page.next ? "syncing" : "success", checkpoint: nextCheckpoint,
      earliestBackfilledAt: state?.earliestBackfilledAt ?? now,
      latestSyncedExecutedAt: now,
      backfillStartedAt: state?.backfillStartedAt ?? now,
      backfillCompletedAt: page.next ? null : now,
      lastSyncedAt: now, lastHttpStatus: 200, lastErrorMessage: null,
    },
  });
  return { transactionCount: saved.transactions.transactionCount, shouldContinue: Boolean(page.next) };
}
