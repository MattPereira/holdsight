import { relations } from "drizzle-orm";
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const depositoryAccountKind = pgEnum("depository_account_kind", [
  "checking",
]);

export const depositoryAccountStatus = pgEnum("depository_account_status", [
  "active",
  "disabled",
  "error",
]);

export const depositoryAccounts = pgTable(
  "depository_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: depositoryAccountKind("kind").default("checking").notNull(),
    provider: text("provider").notNull(),
    label: text("label"),
    institutionName: text("institution_name"),
    accountMask: text("account_mask"),
    currency: text("currency").default("USD").notNull(),
    currentBalance: numeric("current_balance", {
      precision: 18,
      scale: 2,
    }).notNull(),
    status: depositoryAccountStatus("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("depository_accounts_user_id_idx").on(table.userId),
    index("depository_accounts_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const depositoryAccountsRelations = relations(
  depositoryAccounts,
  ({ one }) => ({
    user: one(user, {
      fields: [depositoryAccounts.userId],
      references: [user.id],
    }),
  }),
);
