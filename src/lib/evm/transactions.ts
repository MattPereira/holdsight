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

function transferForWallet(transaction: ZerionTransaction, address: string): ZerionTransfer | null {
  const normalized = address.toLowerCase();
  return transaction.attributes.transfers?.find((transfer) =>
    transfer.sender?.toLowerCase() === normalized || transfer.recipient?.toLowerCase() === normalized,
  ) ?? transaction.attributes.transfers?.[0] ?? null;
}

function sideFor(transaction: ZerionTransaction, transfer: ZerionTransfer | null, address: string): InvestmentTransactionSide {
  if (transaction.attributes.operation_type === "trade") return "swap";
  if (transfer?.recipient?.toLowerCase() === address.toLowerCase() || transfer?.direction === "in") return "receive";
  if (transfer?.sender?.toLowerCase() === address.toLowerCase() || transfer?.direction === "out") return "send";
  return "unknown";
}

function normalized(transaction: ZerionTransaction, account: SavedEvmAccount): NormalizedInvestmentTransaction {
  const transfer = transferForWallet(transaction, account.address);
  const attributes = transaction.attributes;
  const quantity = transfer?.quantity?.numeric ?? transfer?.quantity?.float ?? null;
  return {
    sourceProvider: ZERION_PROVIDER,
    sourceTransactionId: transaction.id,
    sourceAccountId: account.address,
    executedAt: new Date(attributes.mined_at ?? Date.now()),
    kind: transactionKind(attributes.operation_type),
    side: sideFor(transaction, transfer, account.address),
    baseAssetSymbol: transfer?.fungible_info?.symbol ?? attributes.operation_type ?? null,
    baseAssetId: transfer?.fungible_info?.id ?? null,
    baseAmount: quantity,
    valueUsd: transfer?.value ?? null,
    priceQuote: transfer?.price ?? null,
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
  const saved = await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions: page.transactions.map((transaction) => normalized(transaction, input.account)),
      evmDetails: page.transactions.map(detail),
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
