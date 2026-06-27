import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const assetGroups = pgTable(
  "asset_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    color: text("color"),
    thesis: text("thesis"),
    targetAllocationPercent: numeric("target_allocation_percent", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("asset_groups_id_user_id_unique").on(table.id, table.userId),
    index("asset_groups_user_id_idx").on(table.userId),
    check(
      "asset_groups_target_allocation_percent_check",
      sql`${table.targetAllocationPercent} is null or (${table.targetAllocationPercent} >= 0 and ${table.targetAllocationPercent} <= 100)`,
    ),
  ],
);

export const assetGroupMembers = pgTable(
  "asset_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => assetGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.symbol] }),
    // A symbol can belong to at most one group per user so combined totals
    // never double-count a holding.
    uniqueIndex("asset_group_members_user_symbol_idx").on(
      table.userId,
      table.symbol,
    ),
    index("asset_group_members_group_id_idx").on(table.groupId),
  ],
);

export const assetGroupsRelations = relations(assetGroups, ({ one, many }) => ({
  user: one(user, {
    fields: [assetGroups.userId],
    references: [user.id],
  }),
  members: many(assetGroupMembers),
}));

export const assetGroupMembersRelations = relations(
  assetGroupMembers,
  ({ one }) => ({
    group: one(assetGroups, {
      fields: [assetGroupMembers.groupId],
      references: [assetGroups.id],
    }),
  }),
);
