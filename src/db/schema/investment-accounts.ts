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

export const investmentAccountKind = pgEnum("investment_account_kind", [
  "evm_wallet",
  "hyper_core",
  "centralized_exchange",
  "brokerage",
]);

export const investmentAccountStatus = pgEnum("investment_account_status", [
  "active",
  "disabled",
  "error",
]);

export const investmentAccountSyncStatus = pgEnum(
  "investment_account_sync_status",
  ["idle", "success", "indexing", "rate_limited", "error"],
);

export const brokerageAccountType = pgEnum("brokerage_account_type", [
  "taxable",
  "traditional_ira",
  "roth_ira",
  "sep_ira",
  "simple_ira",
  "401k",
  "other_retirement",
]);

export const assetClass = pgEnum("asset_class", [
  "crypto",
  "token",
  "cash",
  "stock",
  "etf",
  "derivative",
  "other",
]);

export const investmentAccounts = pgTable(
  "investment_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: investmentAccountKind("kind").notNull(),
    provider: text("provider").notNull(),
    label: text("label"),
    status: investmentAccountStatus("status").default("active").notNull(),
    syncProvider: text("sync_provider"),
    syncStatus: investmentAccountSyncStatus("sync_status")
      .default("idle")
      .notNull(),
    syncHttpStatus: integer("sync_http_status"),
    syncErrorMessage: text("sync_error_message"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("investment_accounts_id_user_id_unique").on(table.id, table.userId),
    index("investment_accounts_user_id_idx").on(table.userId),
    index("investment_accounts_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const evmWalletAccounts = pgTable(
  "evm_wallet_accounts",
  {
    investmentAccountId: uuid("investment_account_id").primaryKey(),
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
      name: "evm_wallet_accounts_investment_account_user_fk",
      columns: [table.investmentAccountId, table.userId],
      foreignColumns: [investmentAccounts.id, investmentAccounts.userId],
    }).onDelete("cascade"),
  ],
);

export const hyperCoreAccounts = pgTable(
  "hyper_core_accounts",
  {
    investmentAccountId: uuid("investment_account_id").primaryKey(),
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
      name: "hyper_core_accounts_investment_account_user_fk",
      columns: [table.investmentAccountId, table.userId],
      foreignColumns: [investmentAccounts.id, investmentAccounts.userId],
    }).onDelete("cascade"),
  ],
);

export const centralizedExchangeAccounts = pgTable(
  "centralized_exchange_accounts",
  {
    investmentAccountId: uuid("investment_account_id")
      .primaryKey()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
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
    investmentAccountId: uuid("investment_account_id")
      .primaryKey()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
    brokerage: text("brokerage").notNull(),
    accountType: brokerageAccountType("account_type")
      .default("taxable")
      .notNull(),
    externalAccountId: text("external_account_id"),
  },
  (table) => [index("brokerage_accounts_brokerage_idx").on(table.brokerage)],
);

export const investmentPositions = pgTable(
  "investment_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investmentAccountId: uuid("investment_account_id")
      .notNull()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
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
    index("investment_positions_investment_account_id_idx").on(
      table.investmentAccountId,
    ),
    index("investment_positions_symbol_idx").on(table.symbol),
  ],
);

export const evmPositionDetails = pgTable("evm_position_details", {
  positionId: uuid("position_id")
    .primaryKey()
    .references(() => investmentPositions.id, { onDelete: "cascade" }),
  chainId: text("chain_id").notNull(),
  contractAddress: text("contract_address"),
});

export const hyperCorePositionDetails = pgTable("hyper_core_position_details", {
  positionId: uuid("position_id")
    .primaryKey()
    .references(() => investmentPositions.id, { onDelete: "cascade" }),
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

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  authAccounts: many(account),
  investmentAccounts: many(investmentAccounts),
}));

export const investmentAccountsRelations = relations(
  investmentAccounts,
  ({ one, many }) => ({
    user: one(user, {
      fields: [investmentAccounts.userId],
      references: [user.id],
    }),
    evmWalletAccount: one(evmWalletAccounts),
    hyperCoreAccount: one(hyperCoreAccounts),
    centralizedExchangeAccount: one(centralizedExchangeAccounts),
    brokerageAccount: one(brokerageAccounts),
    positions: many(investmentPositions),
  }),
);

export const evmWalletAccountsRelations = relations(
  evmWalletAccounts,
  ({ one }) => ({
    investmentAccount: one(investmentAccounts, {
      fields: [evmWalletAccounts.investmentAccountId],
      references: [investmentAccounts.id],
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
    investmentAccount: one(investmentAccounts, {
      fields: [hyperCoreAccounts.investmentAccountId],
      references: [investmentAccounts.id],
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
    investmentAccount: one(investmentAccounts, {
      fields: [centralizedExchangeAccounts.investmentAccountId],
      references: [investmentAccounts.id],
    }),
  }),
);

export const brokerageAccountsRelations = relations(
  brokerageAccounts,
  ({ one }) => ({
    investmentAccount: one(investmentAccounts, {
      fields: [brokerageAccounts.investmentAccountId],
      references: [investmentAccounts.id],
    }),
  }),
);

export const investmentPositionsRelations = relations(
  investmentPositions,
  ({ one }) => ({
    investmentAccount: one(investmentAccounts, {
      fields: [investmentPositions.investmentAccountId],
      references: [investmentAccounts.id],
    }),
    evmDetails: one(evmPositionDetails),
    hyperCoreDetails: one(hyperCorePositionDetails),
  }),
);

export const evmPositionDetailsRelations = relations(
  evmPositionDetails,
  ({ one }) => ({
    position: one(investmentPositions, {
      fields: [evmPositionDetails.positionId],
      references: [investmentPositions.id],
    }),
  }),
);

export const hyperCorePositionDetailsRelations = relations(
  hyperCorePositionDetails,
  ({ one }) => ({
    position: one(investmentPositions, {
      fields: [hyperCorePositionDetails.positionId],
      references: [investmentPositions.id],
    }),
  }),
);
