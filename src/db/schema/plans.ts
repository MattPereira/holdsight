import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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

import { PLAN_FIELDS, type PlanField } from "@/lib/portfolio/plan";

import { user } from "./auth";

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    thesis: text("thesis"),
    invalidation: text("invalidation"),
    risk: text("risk"),
    profit: text("profit"),
    entry: text("entry"),
    adding: text("adding"),
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
    unique("plans_id_user_id_unique").on(table.id, table.userId),
    index("plans_user_id_idx").on(table.userId),
    check(
      "plans_target_allocation_percent_check",
      sql`${table.targetAllocationPercent} is null or (${table.targetAllocationPercent} >= 0 and ${table.targetAllocationPercent} <= 100)`,
    ),
    check(
      "plans_name_length_check",
      sql`char_length(${table.name}) between 1 and 40`,
    ),
  ],
);

export const planAssets = pgTable(
  "plan_assets",
  {
    planId: uuid("plan_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.symbol] }),
    uniqueIndex("plan_assets_user_symbol_idx").on(table.userId, table.symbol),
    index("plan_assets_plan_id_idx").on(table.planId),
    foreignKey({
      name: "plan_assets_plan_user_fk",
      columns: [table.planId, table.userId],
      foreignColumns: [plans.id, plans.userId],
    }).onDelete("cascade"),
  ],
);

export const plansRelations = relations(plans, ({ one, many }) => ({
  user: one(user, {
    fields: [plans.userId],
    references: [user.id],
  }),
  assets: many(planAssets),
}));

export const planAssetsRelations = relations(planAssets, ({ one }) => ({
  plan: one(plans, {
    fields: [planAssets.planId],
    references: [plans.id],
  }),
}));

/**
 * The Plan commitment columns, keyed by field, for reuse in `select()` shapes.
 * Typed per column so row types stay precise.
 */
export const planDetailColumns = Object.fromEntries(
  PLAN_FIELDS.map((field) => [field.key, plans[field.key]]),
) as { [K in PlanField]: (typeof plans)[K] };
