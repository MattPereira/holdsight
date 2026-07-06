import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const journalPeriodType = pgEnum("journal_period_type", [
  "daily",
  "weekly",
  "monthly",
]);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  homeTimezone: text("home_timezone").notNull(),
  createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { precision: 3 })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const investmentJournalEntries = pgTable(
  "investment_journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    periodType: journalPeriodType("period_type").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    plan: text("plan"),
    reflection: text("reflection"),
    createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("investment_journal_entries_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
    uniqueIndex("investment_journal_entries_period_unique").on(
      table.userId,
      table.periodType,
      table.periodStart,
    ),
    index("investment_journal_entries_period_lookup_idx").on(
      table.userId,
      table.periodType,
      table.periodStart,
    ),
    index("investment_journal_entries_recent_idx").on(
      table.userId,
      table.periodType,
      table.updatedAt,
    ),
    check(
      "investment_journal_entries_plan_length_check",
      sql`${table.plan} is null or char_length(${table.plan}) <= 10000`,
    ),
    check(
      "investment_journal_entries_reflection_length_check",
      sql`${table.reflection} is null or char_length(${table.reflection}) <= 10000`,
    ),
  ],
);

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(user, {
      fields: [userPreferences.userId],
      references: [user.id],
    }),
  }),
);

export const investmentJournalEntryRelations = relations(
  investmentJournalEntries,
  ({ one }) => ({
    user: one(user, {
      fields: [investmentJournalEntries.userId],
      references: [user.id],
    }),
  }),
);
