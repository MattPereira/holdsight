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

export const manualBalanceItemKind = pgEnum("manual_balance_item_kind", [
  "asset",
  "liability",
]);

export const manualBalanceItems = pgTable(
  "manual_balance_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: manualBalanceItemKind("kind").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    currency: text("currency").default("USD").notNull(),
    amount: numeric("amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("manual_balance_items_user_id_idx").on(table.userId),
    index("manual_balance_items_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const manualBalanceItemsRelations = relations(
  manualBalanceItems,
  ({ one }) => ({
    user: one(user, {
      fields: [manualBalanceItems.userId],
      references: [user.id],
    }),
  }),
);
