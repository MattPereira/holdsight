import { relations } from "drizzle-orm";
import {
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

import { account, session, user } from "./auth";

export const financialAccountKind = pgEnum("financial_account_kind", [
  "evm_wallet",
  "hyper_core",
  "centralized_exchange",
  "brokerage",
  "bank",
]);

export const financialAccountStatus = pgEnum("financial_account_status", [
  "active",
  "disabled",
  "error",
]);

export const financialAccountSyncRunStatus = pgEnum(
  "financial_account_sync_run_status",
  ["success", "indexing", "rate_limited", "error"],
);

export const assetClass = pgEnum("asset_class", [
  "crypto",
  "token",
  "cash",
  "stock",
  "etf",
  "derivative",
  "other",
]);

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: financialAccountKind("kind").notNull(),
    provider: text("provider").notNull(),
    label: text("label"),
    status: financialAccountStatus("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("financial_accounts_id_user_id_unique").on(table.id, table.userId),
    index("financial_accounts_user_id_idx").on(table.userId),
    index("financial_accounts_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const evmWalletAccounts = pgTable(
  "evm_wallet_accounts",
  {
    financialAccountId: uuid("financial_account_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    address: text("address").notNull(),
  },
  (table) => [
    uniqueIndex("evm_wallet_accounts_user_address_idx").on(
      table.userId,
      table.address,
    ),
    index("evm_wallet_accounts_address_idx").on(table.address),
    foreignKey({
      name: "evm_wallet_accounts_financial_account_user_fk",
      columns: [table.financialAccountId, table.userId],
      foreignColumns: [financialAccounts.id, financialAccounts.userId],
    }).onDelete("cascade"),
  ],
);

export const hyperCoreAccounts = pgTable(
  "hyper_core_accounts",
  {
    financialAccountId: uuid("financial_account_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    externalAccountId: text("external_account_id"),
    address: text("address").notNull(),
  },
  (table) => [
    uniqueIndex("hyper_core_accounts_user_address_idx").on(
      table.userId,
      table.address,
    ),
    index("hyper_core_accounts_address_idx").on(table.address),
    foreignKey({
      name: "hyper_core_accounts_financial_account_user_fk",
      columns: [table.financialAccountId, table.userId],
      foreignColumns: [financialAccounts.id, financialAccounts.userId],
    }).onDelete("cascade"),
  ],
);

export const centralizedExchangeAccounts = pgTable(
  "centralized_exchange_accounts",
  {
    financialAccountId: uuid("financial_account_id")
      .primaryKey()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    exchange: text("exchange").notNull(),
    externalAccountId: text("external_account_id"),
  },
  (table) => [
    index("centralized_exchange_accounts_exchange_idx").on(table.exchange),
  ],
);

export const brokerageAccounts = pgTable(
  "brokerage_accounts",
  {
    financialAccountId: uuid("financial_account_id")
      .primaryKey()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    brokerage: text("brokerage").notNull(),
    externalAccountId: text("external_account_id"),
  },
  (table) => [index("brokerage_accounts_brokerage_idx").on(table.brokerage)],
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    financialAccountId: uuid("financial_account_id")
      .primaryKey()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    bank: text("bank").notNull(),
    externalAccountId: text("external_account_id"),
  },
  (table) => [index("bank_accounts_bank_idx").on(table.bank)],
);

export const financialAccountSyncRuns = pgTable(
  "financial_account_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    financialAccountId: uuid("financial_account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: financialAccountSyncRunStatus("status").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    httpStatus: integer("http_status"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("financial_account_sync_runs_financial_account_id_idx").on(
      table.financialAccountId,
    ),
    index("financial_account_sync_runs_latest_success_idx").on(
      table.financialAccountId,
      table.status,
      table.finishedAt,
    ),
  ],
);

export const financialAccountPositions = pgTable(
  "financial_account_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => financialAccountSyncRuns.id, { onDelete: "cascade" }),
    sourcePositionId: text("source_position_id"),
    symbol: text("symbol").notNull(),
    name: text("name"),
    assetClass: assetClass("asset_class").notNull(),
    amount: numeric("amount", { precision: 36, scale: 18 }).notNull(),
    priceUsd: numeric("price_usd", { precision: 36, scale: 18 }).notNull(),
    valueUsd: numeric("value_usd", { precision: 36, scale: 18 }).notNull(),
    asOf: timestamp("as_of").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("financial_account_positions_sync_run_id_idx").on(table.syncRunId),
    index("financial_account_positions_symbol_idx").on(table.symbol),
  ],
);

export const evmPositionDetails = pgTable("evm_position_details", {
  positionId: uuid("position_id")
    .primaryKey()
    .references(() => financialAccountPositions.id, { onDelete: "cascade" }),
  chainId: text("chain_id").notNull(),
  contractAddress: text("contract_address"),
});

export const hyperCorePositionDetails = pgTable("hyper_core_position_details", {
  positionId: uuid("position_id")
    .primaryKey()
    .references(() => financialAccountPositions.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  side: text("side").notNull(),
  signedSize: numeric("signed_size", { precision: 36, scale: 18 }).notNull(),
  entryPx: numeric("entry_px", { precision: 36, scale: 18 }).notNull(),
  liquidationPx: numeric("liquidation_px", { precision: 36, scale: 18 }),
  marginUsed: numeric("margin_used", { precision: 36, scale: 18 }).notNull(),
  unrealizedPnl: numeric("unrealized_pnl", {
    precision: 36,
    scale: 18,
  }).notNull(),
  returnOnEquity: numeric("return_on_equity", {
    precision: 36,
    scale: 18,
  }),
  leverageType: text("leverage_type"),
  leverageValue: numeric("leverage_value", { precision: 36, scale: 18 }),
  rawLeverage: jsonb("raw_leverage"),
});

export const hyperCoreAccountSnapshots = pgTable("hyper_core_account_snapshots", {
  syncRunId: uuid("sync_run_id")
    .primaryKey()
    .references(() => financialAccountSyncRuns.id, { onDelete: "cascade" }),
  accountValue: numeric("account_value", { precision: 36, scale: 18 }).notNull(),
  totalMarginUsed: numeric("total_margin_used", {
    precision: 36,
    scale: 18,
  }).notNull(),
  totalNtlPos: numeric("total_ntl_pos", { precision: 36, scale: 18 }).notNull(),
  totalRawUsd: numeric("total_raw_usd", { precision: 36, scale: 18 }).notNull(),
  withdrawable: numeric("withdrawable", { precision: 36, scale: 18 }).notNull(),
  sourceTime: timestamp("source_time"),
  raw: jsonb("raw"),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  authAccounts: many(account),
  financialAccounts: many(financialAccounts),
}));

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ one, many }) => ({
    user: one(user, {
      fields: [financialAccounts.userId],
      references: [user.id],
    }),
    evmWalletAccount: one(evmWalletAccounts),
    hyperCoreAccount: one(hyperCoreAccounts),
    centralizedExchangeAccount: one(centralizedExchangeAccounts),
    brokerageAccount: one(brokerageAccounts),
    bankAccount: one(bankAccounts),
    syncRuns: many(financialAccountSyncRuns),
  }),
);

export const evmWalletAccountsRelations = relations(
  evmWalletAccounts,
  ({ one }) => ({
    financialAccount: one(financialAccounts, {
      fields: [evmWalletAccounts.financialAccountId],
      references: [financialAccounts.id],
    }),
    user: one(user, {
      fields: [evmWalletAccounts.userId],
      references: [user.id],
    }),
  }),
);

export const hyperCoreAccountsRelations = relations(
  hyperCoreAccounts,
  ({ one }) => ({
    financialAccount: one(financialAccounts, {
      fields: [hyperCoreAccounts.financialAccountId],
      references: [financialAccounts.id],
    }),
    user: one(user, {
      fields: [hyperCoreAccounts.userId],
      references: [user.id],
    }),
  }),
);

export const centralizedExchangeAccountsRelations = relations(
  centralizedExchangeAccounts,
  ({ one }) => ({
    financialAccount: one(financialAccounts, {
      fields: [centralizedExchangeAccounts.financialAccountId],
      references: [financialAccounts.id],
    }),
  }),
);

export const brokerageAccountsRelations = relations(
  brokerageAccounts,
  ({ one }) => ({
    financialAccount: one(financialAccounts, {
      fields: [brokerageAccounts.financialAccountId],
      references: [financialAccounts.id],
    }),
  }),
);

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  financialAccount: one(financialAccounts, {
    fields: [bankAccounts.financialAccountId],
    references: [financialAccounts.id],
  }),
}));

export const financialAccountSyncRunsRelations = relations(
  financialAccountSyncRuns,
  ({ one, many }) => ({
    financialAccount: one(financialAccounts, {
      fields: [financialAccountSyncRuns.financialAccountId],
      references: [financialAccounts.id],
    }),
    positions: many(financialAccountPositions),
  }),
);

export const financialAccountPositionsRelations = relations(
  financialAccountPositions,
  ({ one }) => ({
    syncRun: one(financialAccountSyncRuns, {
      fields: [financialAccountPositions.syncRunId],
      references: [financialAccountSyncRuns.id],
    }),
    evmDetails: one(evmPositionDetails),
    hyperCoreDetails: one(hyperCorePositionDetails),
  }),
);

export const evmPositionDetailsRelations = relations(
  evmPositionDetails,
  ({ one }) => ({
    position: one(financialAccountPositions, {
      fields: [evmPositionDetails.positionId],
      references: [financialAccountPositions.id],
    }),
  }),
);

export const hyperCorePositionDetailsRelations = relations(
  hyperCorePositionDetails,
  ({ one }) => ({
    position: one(financialAccountPositions, {
      fields: [hyperCorePositionDetails.positionId],
      references: [financialAccountPositions.id],
    }),
  }),
);

export const hyperCoreAccountSnapshotsRelations = relations(
  hyperCoreAccountSnapshots,
  ({ one }) => ({
    syncRun: one(financialAccountSyncRuns, {
      fields: [hyperCoreAccountSnapshots.syncRunId],
      references: [financialAccountSyncRuns.id],
    }),
  }),
);
