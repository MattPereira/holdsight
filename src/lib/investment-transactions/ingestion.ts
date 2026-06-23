import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  brokerageTransactionDetails,
  evmTransactionDetails,
  hyperCoreTransactionDetails,
  investmentTransactionSyncs,
  investmentTransactions,
} from "@/db/schema/investment-transactions";

export type InvestmentTransactionKind =
  | "trade"
  | "transfer"
  | "fee"
  | "dividend"
  | "interest"
  | "deposit"
  | "withdrawal"
  | "adjustment"
  | "unknown";

export type InvestmentTransactionSide =
  | "buy"
  | "sell"
  | "swap"
  | "open"
  | "close"
  | "increase"
  | "decrease"
  | "receive"
  | "send"
  | "unknown";

export type InvestmentTransactionStatus =
  | "confirmed"
  | "pending"
  | "failed"
  | "canceled"
  | "unknown";

export type InvestmentTransactionSyncStatus =
  | "idle"
  | "syncing"
  | "success"
  | "rate_limited"
  | "error";

/**
 * Provider-owned, durable progress for a transaction history import.
 *
 * The ingestion layer deliberately does not interpret this object. For
 * example, Kraken will store its backfill offset and forward scan boundary
 * here, while other providers can use their own cursor formats.
 */
export type InvestmentTransactionSyncCheckpoint = Record<string, unknown>;

export type NormalizedInvestmentTransaction = {
  sourceProvider: string;
  sourceTransactionId: string;
  sourceAccountId?: string | null;
  executedAt: Date;
  settledAt?: Date | null;
  kind?: InvestmentTransactionKind;
  side?: InvestmentTransactionSide;
  baseAssetSymbol?: string | null;
  baseAssetId?: string | null;
  baseAmount?: string | number | null;
  quoteAssetSymbol?: string | null;
  quoteAssetId?: string | null;
  quoteAmount?: string | number | null;
  priceQuote?: string | number | null;
  valueUsd?: string | number | null;
  feeAmount?: string | number | null;
  feeAssetSymbol?: string | null;
  chainId?: string | null;
  txHash?: string | null;
  status?: InvestmentTransactionStatus;
  raw: unknown;
};

export type NormalizedEvmTransactionDetails = {
  sourceTransactionId: string;
  chainId: string;
  txHash: string;
  blockNumber?: string | number | null;
  logIndex?: number | null;
  actionIndex?: number | null;
  protocol?: string | null;
  method?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
};

export type NormalizedHyperCoreTransactionDetails = {
  sourceTransactionId: string;
  market: string;
  orderId?: string | null;
  fillId?: string | null;
  direction?: string | null;
  crossed?: boolean | null;
  feeToken?: string | null;
};

export type NormalizedBrokerageTransactionDetails = {
  sourceTransactionId: string;
  plaidItemId?: string | null;
  externalAccountId?: string | null;
  securityId?: string | null;
  plaidType?: string | null;
  plaidSubtype?: string | null;
  cancelTransactionId?: string | null;
};

export type UpsertInvestmentTransactionsInput = {
  userId: string;
  investmentAccountId: string;
  transactions: NormalizedInvestmentTransaction[];
  evmDetails?: NormalizedEvmTransactionDetails[];
  hyperCoreDetails?: NormalizedHyperCoreTransactionDetails[];
  brokerageDetails?: NormalizedBrokerageTransactionDetails[];
};

export type UpsertInvestmentTransactionsResult = {
  transactionCount: number;
  evmDetailCount: number;
  hyperCoreDetailCount: number;
  brokerageDetailCount: number;
};

export type InvestmentTransactionSyncState = {
  id: string;
  userId: string;
  investmentAccountId: string;
  provider: string;
  status: InvestmentTransactionSyncStatus;
  checkpoint: InvestmentTransactionSyncCheckpoint | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  earliestBackfilledAt: Date | null;
  latestSyncedExecutedAt: Date | null;
  backfillStartedAt: Date | null;
  backfillCompletedAt: Date | null;
  lastSyncedAt: Date | null;
  lastHttpStatus: number | null;
  lastErrorMessage: string | null;
};

export type UpsertInvestmentTransactionSyncStateInput = {
  userId: string;
  investmentAccountId: string;
  provider: string;
  status: InvestmentTransactionSyncStatus;
  checkpoint?: InvestmentTransactionSyncCheckpoint | null;
  leaseToken?: string | null;
  leaseExpiresAt?: Date | null;
  earliestBackfilledAt?: Date | null;
  latestSyncedExecutedAt?: Date | null;
  backfillStartedAt?: Date | null;
  backfillCompletedAt?: Date | null;
  lastSyncedAt?: Date | null;
  lastHttpStatus?: number | null;
  lastErrorMessage?: string | null;
};

type TransactionIdLookup = Map<string, string>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function decimalValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function upsertedTransactionId(
  idsBySourceTransactionId: TransactionIdLookup,
  sourceTransactionId: string,
): string {
  const transactionId = idsBySourceTransactionId.get(sourceTransactionId);
  if (!transactionId) {
    throw new Error(
      `No investment transaction was written for ${sourceTransactionId}.`,
    );
  }

  return transactionId;
}

export async function getInvestmentTransactionSyncState(input: {
  userId: string;
  investmentAccountId: string;
  provider: string;
}): Promise<InvestmentTransactionSyncState | null> {
  const [state] = await db
    .select({
      id: investmentTransactionSyncs.id,
      userId: investmentTransactionSyncs.userId,
      investmentAccountId: investmentTransactionSyncs.investmentAccountId,
      provider: investmentTransactionSyncs.provider,
      status: investmentTransactionSyncs.status,
      checkpoint: investmentTransactionSyncs.checkpoint,
      leaseToken: investmentTransactionSyncs.leaseToken,
      leaseExpiresAt: investmentTransactionSyncs.leaseExpiresAt,
      earliestBackfilledAt: investmentTransactionSyncs.earliestBackfilledAt,
      latestSyncedExecutedAt:
        investmentTransactionSyncs.latestSyncedExecutedAt,
      backfillStartedAt: investmentTransactionSyncs.backfillStartedAt,
      backfillCompletedAt: investmentTransactionSyncs.backfillCompletedAt,
      lastSyncedAt: investmentTransactionSyncs.lastSyncedAt,
      lastHttpStatus: investmentTransactionSyncs.lastHttpStatus,
      lastErrorMessage: investmentTransactionSyncs.lastErrorMessage,
    })
    .from(investmentTransactionSyncs)
    .where(
      and(
        eq(investmentTransactionSyncs.userId, input.userId),
        eq(
          investmentTransactionSyncs.investmentAccountId,
          input.investmentAccountId,
        ),
        eq(investmentTransactionSyncs.provider, input.provider),
      ),
    )
    .limit(1);

  return state ?? null;
}

export async function upsertInvestmentTransactionSyncState(
  input: UpsertInvestmentTransactionSyncStateInput,
): Promise<InvestmentTransactionSyncState> {
  return db.transaction((tx) =>
    upsertInvestmentTransactionSyncStateInTransaction(tx, input),
  );
}

async function upsertInvestmentTransactionSyncStateInTransaction(
  tx: DbTransaction,
  input: UpsertInvestmentTransactionSyncStateInput,
): Promise<InvestmentTransactionSyncState> {
  const now = new Date();
  const [state] = await tx
    .insert(investmentTransactionSyncs)
    .values({
      userId: input.userId,
      investmentAccountId: input.investmentAccountId,
      provider: input.provider,
      status: input.status,
      checkpoint: input.checkpoint ?? null,
      leaseToken: input.leaseToken ?? null,
      leaseExpiresAt: input.leaseExpiresAt ?? null,
      earliestBackfilledAt: input.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt: input.latestSyncedExecutedAt ?? null,
      backfillStartedAt: input.backfillStartedAt ?? null,
      backfillCompletedAt: input.backfillCompletedAt ?? null,
      lastSyncedAt: input.lastSyncedAt ?? now,
      lastHttpStatus: input.lastHttpStatus ?? null,
      lastErrorMessage: input.lastErrorMessage ?? null,
    })
    .onConflictDoUpdate({
      target: [
        investmentTransactionSyncs.investmentAccountId,
        investmentTransactionSyncs.provider,
      ],
      set: {
        status: input.status,
        checkpoint: input.checkpoint ?? null,
        leaseToken: input.leaseToken ?? null,
        leaseExpiresAt: input.leaseExpiresAt ?? null,
        earliestBackfilledAt: input.earliestBackfilledAt ?? null,
        latestSyncedExecutedAt: input.latestSyncedExecutedAt ?? null,
        backfillStartedAt: input.backfillStartedAt ?? null,
        backfillCompletedAt: input.backfillCompletedAt ?? null,
        lastSyncedAt: input.lastSyncedAt ?? now,
        lastHttpStatus: input.lastHttpStatus ?? null,
        lastErrorMessage: input.lastErrorMessage ?? null,
        updatedAt: now,
      },
    })
    .returning({
      id: investmentTransactionSyncs.id,
      userId: investmentTransactionSyncs.userId,
      investmentAccountId: investmentTransactionSyncs.investmentAccountId,
      provider: investmentTransactionSyncs.provider,
      status: investmentTransactionSyncs.status,
      checkpoint: investmentTransactionSyncs.checkpoint,
      leaseToken: investmentTransactionSyncs.leaseToken,
      leaseExpiresAt: investmentTransactionSyncs.leaseExpiresAt,
      earliestBackfilledAt: investmentTransactionSyncs.earliestBackfilledAt,
      latestSyncedExecutedAt:
        investmentTransactionSyncs.latestSyncedExecutedAt,
      backfillStartedAt: investmentTransactionSyncs.backfillStartedAt,
      backfillCompletedAt: investmentTransactionSyncs.backfillCompletedAt,
      lastSyncedAt: investmentTransactionSyncs.lastSyncedAt,
      lastHttpStatus: investmentTransactionSyncs.lastHttpStatus,
      lastErrorMessage: investmentTransactionSyncs.lastErrorMessage,
    });

  return state;
}

export async function upsertInvestmentTransactions(
  input: UpsertInvestmentTransactionsInput,
): Promise<UpsertInvestmentTransactionsResult> {
  return db.transaction((tx) => upsertInvestmentTransactionsInTransaction(tx, input));
}

async function upsertInvestmentTransactionsInTransaction(
  tx: DbTransaction,
  input: UpsertInvestmentTransactionsInput,
): Promise<UpsertInvestmentTransactionsResult> {
  if (input.transactions.length === 0) {
    return {
      transactionCount: 0,
      evmDetailCount: 0,
      hyperCoreDetailCount: 0,
      brokerageDetailCount: 0,
    };
  }

  const now = new Date();
  const upsertedTransactions = await tx
      .insert(investmentTransactions)
      .values(
        input.transactions.map((transaction) => ({
          userId: input.userId,
          investmentAccountId: input.investmentAccountId,
          sourceProvider: transaction.sourceProvider,
          sourceTransactionId: transaction.sourceTransactionId,
          sourceAccountId: transaction.sourceAccountId ?? null,
          executedAt: transaction.executedAt,
          settledAt: transaction.settledAt ?? null,
          kind: transaction.kind ?? "unknown",
          side: transaction.side ?? "unknown",
          baseAssetSymbol: transaction.baseAssetSymbol ?? null,
          baseAssetId: transaction.baseAssetId ?? null,
          baseAmount: decimalValue(transaction.baseAmount),
          quoteAssetSymbol: transaction.quoteAssetSymbol ?? null,
          quoteAssetId: transaction.quoteAssetId ?? null,
          quoteAmount: decimalValue(transaction.quoteAmount),
          priceQuote: decimalValue(transaction.priceQuote),
          valueUsd: decimalValue(transaction.valueUsd),
          feeAmount: decimalValue(transaction.feeAmount),
          feeAssetSymbol: transaction.feeAssetSymbol ?? null,
          chainId: transaction.chainId ?? null,
          txHash: transaction.txHash ?? null,
          status: transaction.status ?? "unknown",
          raw: transaction.raw,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          investmentTransactions.investmentAccountId,
          investmentTransactions.sourceProvider,
          investmentTransactions.sourceTransactionId,
        ],
        set: {
          userId: sql`excluded.user_id`,
          sourceAccountId: sql`excluded.source_account_id`,
          executedAt: sql`excluded.executed_at`,
          settledAt: sql`excluded.settled_at`,
          kind: sql`excluded.kind`,
          side: sql`excluded.side`,
          baseAssetSymbol: sql`excluded.base_asset_symbol`,
          baseAssetId: sql`excluded.base_asset_id`,
          baseAmount: sql`excluded.base_amount`,
          quoteAssetSymbol: sql`excluded.quote_asset_symbol`,
          quoteAssetId: sql`excluded.quote_asset_id`,
          quoteAmount: sql`excluded.quote_amount`,
          priceQuote: sql`excluded.price_quote`,
          valueUsd: sql`excluded.value_usd`,
          feeAmount: sql`excluded.fee_amount`,
          feeAssetSymbol: sql`excluded.fee_asset_symbol`,
          chainId: sql`excluded.chain_id`,
          txHash: sql`excluded.tx_hash`,
          status: sql`excluded.status`,
          raw: sql`excluded.raw`,
          updatedAt: now,
        },
      })
      .returning({
        id: investmentTransactions.id,
        sourceTransactionId: investmentTransactions.sourceTransactionId,
      });

  const idsBySourceTransactionId = new Map(
      upsertedTransactions.map((transaction) => [
        transaction.sourceTransactionId,
        transaction.id,
      ]),
    );

  const evmDetailCount = await upsertEvmDetails(
      tx,
      idsBySourceTransactionId,
      input.evmDetails ?? [],
    );
  const hyperCoreDetailCount = await upsertHyperCoreDetails(
      tx,
      idsBySourceTransactionId,
      input.hyperCoreDetails ?? [],
    );
  const brokerageDetailCount = await upsertBrokerageDetails(
      tx,
      idsBySourceTransactionId,
      input.brokerageDetails ?? [],
    );

  return {
    transactionCount: upsertedTransactions.length,
    evmDetailCount,
    hyperCoreDetailCount,
    brokerageDetailCount,
  };
}

export async function saveInvestmentTransactionPage(input: {
  transactions: UpsertInvestmentTransactionsInput;
  syncState: UpsertInvestmentTransactionSyncStateInput;
}): Promise<{
  transactions: UpsertInvestmentTransactionsResult;
  syncState: InvestmentTransactionSyncState;
}> {
  return db.transaction(async (tx) => ({
    transactions: await upsertInvestmentTransactionsInTransaction(
      tx,
      input.transactions,
    ),
    syncState: await upsertInvestmentTransactionSyncStateInTransaction(
      tx,
      input.syncState,
    ),
  }));
}

async function upsertEvmDetails(
  tx: DbTransaction,
  idsBySourceTransactionId: TransactionIdLookup,
  details: NormalizedEvmTransactionDetails[],
): Promise<number> {
  if (details.length === 0) return 0;

  await tx
    .insert(evmTransactionDetails)
    .values(
      details.map((detail) => ({
        transactionId: upsertedTransactionId(
          idsBySourceTransactionId,
          detail.sourceTransactionId,
        ),
        chainId: detail.chainId,
        txHash: detail.txHash,
        blockNumber: decimalValue(detail.blockNumber),
        logIndex: detail.logIndex ?? null,
        actionIndex: detail.actionIndex ?? null,
        protocol: detail.protocol ?? null,
        method: detail.method ?? null,
        fromAddress: detail.fromAddress ?? null,
        toAddress: detail.toAddress ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: evmTransactionDetails.transactionId,
      set: {
        chainId: sql`excluded.chain_id`,
        txHash: sql`excluded.tx_hash`,
        blockNumber: sql`excluded.block_number`,
        logIndex: sql`excluded.log_index`,
        actionIndex: sql`excluded.action_index`,
        protocol: sql`excluded.protocol`,
        method: sql`excluded.method`,
        fromAddress: sql`excluded.from_address`,
        toAddress: sql`excluded.to_address`,
      },
    });

  return details.length;
}

async function upsertHyperCoreDetails(
  tx: DbTransaction,
  idsBySourceTransactionId: TransactionIdLookup,
  details: NormalizedHyperCoreTransactionDetails[],
): Promise<number> {
  if (details.length === 0) return 0;

  await tx
    .insert(hyperCoreTransactionDetails)
    .values(
      details.map((detail) => ({
        transactionId: upsertedTransactionId(
          idsBySourceTransactionId,
          detail.sourceTransactionId,
        ),
        market: detail.market,
        orderId: detail.orderId ?? null,
        fillId: detail.fillId ?? null,
        direction: detail.direction ?? null,
        crossed: detail.crossed ?? null,
        feeToken: detail.feeToken ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: hyperCoreTransactionDetails.transactionId,
      set: {
        market: sql`excluded.market`,
        orderId: sql`excluded.order_id`,
        fillId: sql`excluded.fill_id`,
        direction: sql`excluded.direction`,
        crossed: sql`excluded.crossed`,
        feeToken: sql`excluded.fee_token`,
      },
    });

  return details.length;
}

async function upsertBrokerageDetails(
  tx: DbTransaction,
  idsBySourceTransactionId: TransactionIdLookup,
  details: NormalizedBrokerageTransactionDetails[],
): Promise<number> {
  if (details.length === 0) return 0;

  await tx
    .insert(brokerageTransactionDetails)
    .values(
      details.map((detail) => ({
        transactionId: upsertedTransactionId(
          idsBySourceTransactionId,
          detail.sourceTransactionId,
        ),
        plaidItemId: detail.plaidItemId ?? null,
        externalAccountId: detail.externalAccountId ?? null,
        securityId: detail.securityId ?? null,
        plaidType: detail.plaidType ?? null,
        plaidSubtype: detail.plaidSubtype ?? null,
        cancelTransactionId: detail.cancelTransactionId ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: brokerageTransactionDetails.transactionId,
      set: {
        plaidItemId: sql`excluded.plaid_item_id`,
        externalAccountId: sql`excluded.external_account_id`,
        securityId: sql`excluded.security_id`,
        plaidType: sql`excluded.plaid_type`,
        plaidSubtype: sql`excluded.plaid_subtype`,
        cancelTransactionId: sql`excluded.cancel_transaction_id`,
      },
    });

  return details.length;
}
