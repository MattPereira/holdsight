import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
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
      table.updatedAt.desc(),
      table.id.desc(),
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

// A database trigger installed by the migration copies Blob pathnames into the
// durable deletion queue before direct or cascaded deletes remove image rows.
export const investmentJournalEntryImages = pgTable(
  "investment_journal_entry_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    journalEntryId: uuid("journal_entry_id").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    blobUrl: text("blob_url").notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("investment_journal_entry_images_blob_pathname_unique").on(
      table.blobPathname,
    ),
    uniqueIndex("investment_journal_entry_images_blob_url_unique").on(
      table.blobUrl,
    ),
    index("investment_journal_entry_images_entry_sort_order_idx").on(
      table.journalEntryId,
      table.sortOrder,
    ),
    foreignKey({
      name: "investment_journal_entry_images_entry_user_fk",
      columns: [table.journalEntryId, table.userId],
      foreignColumns: [
        investmentJournalEntries.id,
        investmentJournalEntries.userId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "investment_journal_entry_images_user_fk",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    check(
      "investment_journal_entry_images_size_bytes_check",
      sql`${table.sizeBytes} > 0`,
    ),
    check(
      "investment_journal_entry_images_sort_order_check",
      sql`${table.sortOrder} >= 0`,
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
  ({ many, one }) => ({
    user: one(user, {
      fields: [investmentJournalEntries.userId],
      references: [user.id],
    }),
    images: many(investmentJournalEntryImages),
  }),
);

export const investmentJournalEntryImageRelations = relations(
  investmentJournalEntryImages,
  ({ one }) => ({
    entry: one(investmentJournalEntries, {
      fields: [investmentJournalEntryImages.journalEntryId],
      references: [investmentJournalEntries.id],
    }),
    user: one(user, {
      fields: [investmentJournalEntryImages.userId],
      references: [user.id],
    }),
  }),
);
