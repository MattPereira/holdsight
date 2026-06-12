import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { plaidItems } from "./investment-accounts";

export const creditAccountStatus = pgEnum("credit_account_status", [
  "active",
  "disabled",
  "error",
]);

export type CreditAccountApr = {
  aprPercentage: number;
  aprType: string;
  balanceSubjectToApr: number | null;
  interestChargeAmount: number | null;
};

export const creditAccounts = pgTable(
  "credit_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    plaidItemId: uuid("plaid_item_id").references(() => plaidItems.id, {
      onDelete: "cascade",
    }),
    externalAccountId: text("external_account_id"), // Plaid account_id
    label: text("label"),
    institutionName: text("institution_name"),
    accountMask: text("account_mask"),
    currency: text("currency").default("USD").notNull(),
    currentBalance: numeric("current_balance", {
      precision: 18,
      scale: 2,
    }).notNull(),
    availableCredit: numeric("available_credit", {
      precision: 18,
      scale: 2,
    }),
    creditLimit: numeric("credit_limit", {
      precision: 18,
      scale: 2,
    }),
    minimumPaymentAmount: numeric("minimum_payment_amount", {
      precision: 18,
      scale: 2,
    }),
    nextPaymentDueDate: date("next_payment_due_date"),
    lastPaymentAmount: numeric("last_payment_amount", {
      precision: 18,
      scale: 2,
    }),
    lastPaymentDate: date("last_payment_date"),
    lastStatementIssueDate: date("last_statement_issue_date"),
    lastStatementBalance: numeric("last_statement_balance", {
      precision: 18,
      scale: 2,
    }),
    isOverdue: boolean("is_overdue"),
    aprs: jsonb("aprs").$type<CreditAccountApr[]>().notNull(),
    status: creditAccountStatus("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("credit_accounts_user_external_account_id_idx").on(
      table.userId,
      table.externalAccountId,
    ),
    index("credit_accounts_user_id_idx").on(table.userId),
    index("credit_accounts_plaid_item_id_idx").on(table.plaidItemId),
  ],
);

export const creditAccountsRelations = relations(
  creditAccounts,
  ({ one }) => ({
    user: one(user, {
      fields: [creditAccounts.userId],
      references: [user.id],
    }),
    plaidItem: one(plaidItems, {
      fields: [creditAccounts.plaidItemId],
      references: [plaidItems.id],
    }),
  }),
);
