import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const agentApiKeys = pgTable(
  "agent_api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    scopes: text("scopes").array().notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_api_keys_key_hash_idx").on(table.keyHash),
    index("agent_api_keys_user_id_idx").on(table.userId),
    index("agent_api_keys_user_revoked_idx").on(table.userId, table.revokedAt),
  ],
);

export const agentApiKeysRelations = relations(agentApiKeys, ({ one }) => ({
  user: one(user, {
    fields: [agentApiKeys.userId],
    references: [user.id],
  }),
}));
