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

export const plaidItemStatus = pgEnum("plaid_item_status", [
  "active",
  "login_required",
  "error",
  "disabled",
]);

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

// A Plaid Item is one institution login (e.g. a single Charles Schwab login).
// One Item can expose multiple brokerage accounts. The access token is the
// long-lived secret used for every subsequent Plaid API call for this Item.
// SECURITY: this column holds the AES-256-GCM ciphertext of the access token
// (see src/lib/plaid/crypto.ts), never the plaintext token.
export const plaidItems = pgTable(
  "plaid_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    status: plaidItemStatus("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("plaid_items_item_id_idx").on(table.itemId),
    index("plaid_items_user_id_idx").on(table.userId),
  ],
);

export const brokerageAccounts = pgTable(
  "brokerage_accounts",
  {
    investmentAccountId: uuid("investment_account_id")
      .primaryKey()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
    plaidItemId: uuid("plaid_item_id").references(() => plaidItems.id, {
      onDelete: "cascade",
    }),
    brokerage: text("brokerage").notNull(),
    accountType: brokerageAccountType("account_type")
      .default("taxable")
      .notNull(),
    externalAccountId: text("external_account_id"),
  },
  (table) => [
    index("brokerage_accounts_brokerage_idx").on(table.brokerage),
    index("brokerage_accounts_plaid_item_id_idx").on(table.plaidItemId),
  ],
);

export const investmentBalances = pgTable(
  "investment_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investmentAccountId: uuid("investment_account_id")
      .notNull()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
    sourceBalanceId: text("source_balance_id"),
    symbol: text("symbol").notNull(),
    name: text("name"),
    assetClass: assetClass("asset_class").notNull(),
    amount: numeric("amount", { precision: 36, scale: 18 }).notNull(),
    priceUsd: numeric("price_usd", { precision: 36, scale: 18 }).notNull(),
    valueUsd: numeric("value_usd", { precision: 36, scale: 18 }).notNull(),
    // Total cost basis of the holding, when the source provides it (Plaid
    // brokerage). Null for sources that don't report it (EVM, HyperCore).
    costBasisUsd: numeric("cost_basis_usd", { precision: 36, scale: 18 }),
    asOf: timestamp("as_of").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("investment_balances_investment_account_id_idx").on(
      table.investmentAccountId,
    ),
    index("investment_balances_symbol_idx").on(table.symbol),
  ],
);

export const evmBalanceDetails = pgTable("evm_balance_details", {
  balanceId: uuid("balance_id")
    .primaryKey()
    .references(() => investmentBalances.id, { onDelete: "cascade" }),
  chainId: text("chain_id").notNull(),
  contractAddress: text("contract_address"),
});

export const hyperCoreBalanceDetails = pgTable("hyper_core_balance_details", {
  balanceId: uuid("balance_id")
    .primaryKey()
    .references(() => investmentBalances.id, { onDelete: "cascade" }),
  balanceType: text("balance_type").notNull(),
});

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
    assetClass: assetClass("asset_class").default("derivative").notNull(),
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
    balances: many(investmentBalances),
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

export const plaidItemsRelations = relations(plaidItems, ({ one, many }) => ({
  user: one(user, {
    fields: [plaidItems.userId],
    references: [user.id],
  }),
  brokerageAccounts: many(brokerageAccounts),
}));

export const brokerageAccountsRelations = relations(
  brokerageAccounts,
  ({ one }) => ({
    investmentAccount: one(investmentAccounts, {
      fields: [brokerageAccounts.investmentAccountId],
      references: [investmentAccounts.id],
    }),
    plaidItem: one(plaidItems, {
      fields: [brokerageAccounts.plaidItemId],
      references: [plaidItems.id],
    }),
  }),
);

export const investmentBalancesRelations = relations(
  investmentBalances,
  ({ one }) => ({
    investmentAccount: one(investmentAccounts, {
      fields: [investmentBalances.investmentAccountId],
      references: [investmentAccounts.id],
    }),
    evmDetails: one(evmBalanceDetails),
    hyperCoreDetails: one(hyperCoreBalanceDetails),
  }),
);

export const evmBalanceDetailsRelations = relations(
  evmBalanceDetails,
  ({ one }) => ({
    balance: one(investmentBalances, {
      fields: [evmBalanceDetails.balanceId],
      references: [investmentBalances.id],
    }),
  }),
);

export const hyperCoreBalanceDetailsRelations = relations(
  hyperCoreBalanceDetails,
  ({ one }) => ({
    balance: one(investmentBalances, {
      fields: [hyperCoreBalanceDetails.balanceId],
      references: [investmentBalances.id],
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
    hyperCoreDetails: one(hyperCorePositionDetails),
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
