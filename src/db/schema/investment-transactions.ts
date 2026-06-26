import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { investmentAccounts, plaidItems } from "./investment-accounts";

export const investmentTransactionKind = pgEnum(
  "investment_transaction_kind",
  [
    "trade",
    "transfer",
    "fee",
    "dividend",
    "interest",
    "deposit",
    "withdrawal",
    "adjustment",
    "unknown",
  ],
);

export const investmentTransactionSide = pgEnum(
  "investment_transaction_side",
  [
    "buy",
    "sell",
    "swap",
    "open",
    "close",
    "increase",
    "decrease",
    "receive",
    "send",
    "unknown",
  ],
);

export const investmentTransactionStatus = pgEnum(
  "investment_transaction_status",
  ["confirmed", "pending", "failed", "canceled", "unknown"],
);

export const investmentTransactionSyncStatus = pgEnum(
  "investment_transaction_sync_status",
  ["idle", "syncing", "success", "rate_limited", "error"],
);

export const tradeJournalReason = pgEnum("trade_journal_reason", [
  "risk_reduction",
  "dip_buy",
  "breakout_buy",
  "take_profit",
  "stop_loss",
  "panic_sell",
  "fomo",
  "rebalance",
  "thesis_change",
  "cash_raise",
]);

export const tradeJournalEmotion = pgEnum("trade_journal_emotion", [
  "calm",
  "confident",
  "uncertain",
  "fearful",
  "greedy",
  "fomo",
  "frustrated",
  "patient",
  "impulsive",
  "disciplined",
  "stressed",
  "excited",
  "regretful",
  "neutral",
]);

export const investmentTransactions = pgTable(
  "investment_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    investmentAccountId: uuid("investment_account_id").notNull(),
    sourceProvider: text("source_provider").notNull(),
    sourceTransactionId: text("source_transaction_id").notNull(),
    sourceAccountId: text("source_account_id"),
    executedAt: timestamp("executed_at").notNull(),
    settledAt: timestamp("settled_at"),
    kind: investmentTransactionKind("kind").default("unknown").notNull(),
    side: investmentTransactionSide("side").default("unknown").notNull(),
    baseAssetSymbol: text("base_asset_symbol"),
    baseAssetId: text("base_asset_id"),
    baseAmount: numeric("base_amount", { precision: 36, scale: 18 }),
    quoteAssetSymbol: text("quote_asset_symbol"),
    quoteAssetId: text("quote_asset_id"),
    quoteAmount: numeric("quote_amount", { precision: 36, scale: 18 }),
    priceQuote: numeric("price_quote", { precision: 36, scale: 18 }),
    valueUsd: numeric("value_usd", { precision: 36, scale: 18 }),
    feeAmount: numeric("fee_amount", { precision: 36, scale: 18 }),
    feeAssetSymbol: text("fee_asset_symbol"),
    chainId: text("chain_id"),
    txHash: text("tx_hash"),
    status: investmentTransactionStatus("status")
      .default("unknown")
      .notNull(),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("investment_transactions_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
    uniqueIndex("investment_transactions_source_unique").on(
      table.investmentAccountId,
      table.sourceProvider,
      table.sourceTransactionId,
    ),
    index("investment_transactions_user_executed_at_idx").on(
      table.userId,
      table.executedAt,
    ),
    index("investment_transactions_account_executed_at_idx").on(
      table.investmentAccountId,
      table.executedAt,
    ),
    index("investment_transactions_provider_idx").on(table.sourceProvider),
    index("investment_transactions_tx_hash_idx").on(table.txHash),
    foreignKey({
      name: "investment_transactions_investment_account_user_fk",
      columns: [table.investmentAccountId, table.userId],
      foreignColumns: [investmentAccounts.id, investmentAccounts.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "investment_transactions_user_fk",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
  ],
);

export const investmentTransactionJournalEntries = pgTable(
  "investment_transaction_journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    note: text("note"),
    tradeReason: tradeJournalReason("trade_reason"),
    emotions: tradeJournalEmotion("emotions")
      .array()
      .default(sql`ARRAY[]::trade_journal_emotion[]`)
      .notNull(),
    confidence: integer("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("investment_transaction_journal_entries_transaction_unique").on(
      table.transactionId,
    ),
    index("investment_transaction_journal_entries_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index(
      "investment_transaction_journal_entries_transaction_created_at_idx",
    ).on(table.transactionId, table.createdAt),
    foreignKey({
      name: "investment_transaction_journal_entries_transaction_user_fk",
      columns: [table.transactionId, table.userId],
      foreignColumns: [investmentTransactions.id, investmentTransactions.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "investment_transaction_journal_entries_user_fk",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    check(
      "investment_transaction_journal_entries_confidence_check",
      sql`${table.confidence} is null or (${table.confidence} >= 1 and ${table.confidence} <= 10)`,
    ),
  ],
);

export const evmTransactionDetails = pgTable(
  "evm_transaction_details",
  {
    transactionId: uuid("transaction_id")
      .primaryKey()
      .references(() => investmentTransactions.id, { onDelete: "cascade" }),
    chainId: text("chain_id").notNull(),
    txHash: text("tx_hash").notNull(),
    blockNumber: numeric("block_number", { precision: 78, scale: 0 }),
    logIndex: integer("log_index"),
    actionIndex: integer("action_index"),
    protocol: text("protocol"),
    method: text("method"),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
  },
  (table) => [
    index("evm_transaction_details_chain_tx_idx").on(
      table.chainId,
      table.txHash,
    ),
  ],
);

export const hyperCoreTransactionDetails = pgTable(
  "hyper_core_transaction_details",
  {
    transactionId: uuid("transaction_id")
      .primaryKey()
      .references(() => investmentTransactions.id, { onDelete: "cascade" }),
    market: text("market").notNull(),
    orderId: text("order_id"),
    fillId: text("fill_id"),
    direction: text("direction"),
    crossed: boolean("crossed"),
    feeToken: text("fee_token"),
  },
  (table) => [
    index("hyper_core_transaction_details_market_idx").on(table.market),
    index("hyper_core_transaction_details_order_id_idx").on(table.orderId),
  ],
);

export const hyperCorePerpEvents = pgTable(
  "hyper_core_perp_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    investmentAccountId: uuid("investment_account_id").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    sourceTransactionIds: jsonb("source_transaction_ids")
      .$type<string[]>()
      .notNull(),
    executedAt: timestamp("executed_at").notNull(),
    market: text("market").notNull(),
    positionSide: text("position_side").notNull(),
    eventType: text("event_type").notNull(),
    baseAssetSymbol: text("base_asset_symbol").notNull(),
    baseAmount: numeric("base_amount", { precision: 36, scale: 18 }).notNull(),
    entryNotionalUsd: numeric("entry_notional_usd", {
      precision: 36,
      scale: 18,
    }),
    exitNotionalUsd: numeric("exit_notional_usd", {
      precision: 36,
      scale: 18,
    }),
    entryPrice: numeric("entry_price", { precision: 36, scale: 18 }),
    exitPrice: numeric("exit_price", { precision: 36, scale: 18 }),
    grossPnlUsd: numeric("gross_pnl_usd", { precision: 36, scale: 18 }),
    feeUsd: numeric("fee_usd", { precision: 36, scale: 18 }),
    netPnlUsd: numeric("net_pnl_usd", { precision: 36, scale: 18 }),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("hyper_core_perp_events_source_unique").on(
      table.investmentAccountId,
      table.sourceEventId,
    ),
    index("hyper_core_perp_events_user_executed_at_idx").on(
      table.userId,
      table.executedAt,
    ),
    index("hyper_core_perp_events_account_executed_at_idx").on(
      table.investmentAccountId,
      table.executedAt,
    ),
    index("hyper_core_perp_events_market_idx").on(table.market),
    foreignKey({
      name: "hyper_core_perp_events_investment_account_user_fk",
      columns: [table.investmentAccountId, table.userId],
      foreignColumns: [investmentAccounts.id, investmentAccounts.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "hyper_core_perp_events_user_fk",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
  ],
);

export const brokerageTransactionDetails = pgTable(
  "brokerage_transaction_details",
  {
    transactionId: uuid("transaction_id")
      .primaryKey()
      .references(() => investmentTransactions.id, { onDelete: "cascade" }),
    plaidItemId: uuid("plaid_item_id").references(() => plaidItems.id, {
      onDelete: "cascade",
    }),
    externalAccountId: text("external_account_id"),
    securityId: text("security_id"),
    plaidType: text("plaid_type"),
    plaidSubtype: text("plaid_subtype"),
    cancelTransactionId: text("cancel_transaction_id"),
  },
  (table) => [
    index("brokerage_transaction_details_plaid_item_id_idx").on(
      table.plaidItemId,
    ),
    index("brokerage_transaction_details_external_account_id_idx").on(
      table.externalAccountId,
    ),
    index("brokerage_transaction_details_security_id_idx").on(table.securityId),
  ],
);

export const investmentTransactionSyncs = pgTable(
  "investment_transaction_syncs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    investmentAccountId: uuid("investment_account_id").notNull(),
    provider: text("provider").notNull(),
    status: investmentTransactionSyncStatus("status")
      .default("idle")
      .notNull(),
    checkpoint: jsonb("checkpoint").$type<Record<string, unknown>>(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    earliestBackfilledAt: timestamp("earliest_backfilled_at"),
    latestSyncedExecutedAt: timestamp("latest_synced_executed_at"),
    backfillStartedAt: timestamp("backfill_started_at"),
    backfillCompletedAt: timestamp("backfill_completed_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastHttpStatus: integer("last_http_status"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("investment_transaction_syncs_account_provider_unique").on(
      table.investmentAccountId,
      table.provider,
    ),
    index("investment_transaction_syncs_user_id_idx").on(table.userId),
    index("investment_transaction_syncs_status_idx").on(table.status),
    foreignKey({
      name: "investment_transaction_syncs_investment_account_user_fk",
      columns: [table.investmentAccountId, table.userId],
      foreignColumns: [investmentAccounts.id, investmentAccounts.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "investment_transaction_syncs_user_fk",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
  ],
);

export const investmentTransactionsRelations = relations(
  investmentTransactions,
  ({ many, one }) => ({
    user: one(user, {
      fields: [investmentTransactions.userId],
      references: [user.id],
    }),
    investmentAccount: one(investmentAccounts, {
      fields: [investmentTransactions.investmentAccountId],
      references: [investmentAccounts.id],
    }),
    evmDetails: one(evmTransactionDetails),
    hyperCoreDetails: one(hyperCoreTransactionDetails),
    brokerageDetails: one(brokerageTransactionDetails),
    journalEntries: many(investmentTransactionJournalEntries),
  }),
);

export const investmentTransactionJournalEntriesRelations = relations(
  investmentTransactionJournalEntries,
  ({ one }) => ({
    user: one(user, {
      fields: [investmentTransactionJournalEntries.userId],
      references: [user.id],
    }),
    transaction: one(investmentTransactions, {
      fields: [investmentTransactionJournalEntries.transactionId],
      references: [investmentTransactions.id],
    }),
  }),
);

export const evmTransactionDetailsRelations = relations(
  evmTransactionDetails,
  ({ one }) => ({
    transaction: one(investmentTransactions, {
      fields: [evmTransactionDetails.transactionId],
      references: [investmentTransactions.id],
    }),
  }),
);

export const hyperCoreTransactionDetailsRelations = relations(
  hyperCoreTransactionDetails,
  ({ one }) => ({
    transaction: one(investmentTransactions, {
      fields: [hyperCoreTransactionDetails.transactionId],
      references: [investmentTransactions.id],
    }),
  }),
);

export const hyperCorePerpEventsRelations = relations(
  hyperCorePerpEvents,
  ({ one }) => ({
    user: one(user, {
      fields: [hyperCorePerpEvents.userId],
      references: [user.id],
    }),
    investmentAccount: one(investmentAccounts, {
      fields: [hyperCorePerpEvents.investmentAccountId],
      references: [investmentAccounts.id],
    }),
  }),
);

export const brokerageTransactionDetailsRelations = relations(
  brokerageTransactionDetails,
  ({ one }) => ({
    transaction: one(investmentTransactions, {
      fields: [brokerageTransactionDetails.transactionId],
      references: [investmentTransactions.id],
    }),
    plaidItem: one(plaidItems, {
      fields: [brokerageTransactionDetails.plaidItemId],
      references: [plaidItems.id],
    }),
  }),
);

export const investmentTransactionSyncsRelations = relations(
  investmentTransactionSyncs,
  ({ one }) => ({
    user: one(user, {
      fields: [investmentTransactionSyncs.userId],
      references: [user.id],
    }),
    investmentAccount: one(investmentAccounts, {
      fields: [investmentTransactionSyncs.investmentAccountId],
      references: [investmentAccounts.id],
    }),
  }),
);
