import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { ACCESS_ROLES } from "@/lib/auth/policy";

export const accessRole = pgEnum("access_role", ACCESS_ROLES);

/**
 * Who may use this instance, and with what authority (ADR 0005).
 *
 * Keyed by email rather than by user id, and with no foreign key to `user`, so
 * a grant can be written before that person has ever signed in — which is how a
 * fresh database is bootstrapped. Presence grants access; deleting the row
 * revokes it on the next request. There is no status column and no history:
 * grant administration is manual SQL.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    email: text("email").primaryKey(),
    role: accessRole("role").notNull().default("member"),
  },
  (table) => [
    // The lookup compares against an application-normalized email, so a row
    // stored any other way would silently never match.
    check(
      "access_grants_email_normalized_check",
      sql`${table.email} = lower(btrim(${table.email})) and char_length(${table.email}) > 0`,
    ),
  ],
);
