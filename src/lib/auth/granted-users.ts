import "server-only";

import { cache } from "react";
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/index";
import { accessGrants } from "@/db/schema/access-grants";
import { user } from "@/db/schema/auth";
import { normalizeEmail, type AccessGrantLookup } from "@/lib/auth/access-grants";
import type { GrantedUser } from "@/lib/auth/user-summary";

export const findAccessGrant: AccessGrantLookup = async (email) => {
  const [grant] = await db
    .select({ role: accessGrants.role })
    .from(accessGrants)
    .where(eq(accessGrants.email, normalizeEmail(email)))
    .limit(1);

  return grant?.role ?? null;
};

/**
 * Every user this instance still admits, with the role that decides what they
 * may write. The inner join is the point: a user row whose grant was deleted
 * disappears from switching, from the sidebar, and from the effective-user
 * resolver at once, without waiting for a new sign-in.
 *
 * Cached so the actor lookup, the resolver, and the sidebar cannot read two
 * different snapshots within one request.
 */
export const getGrantedUsers = cache(async (): Promise<GrantedUser[]> => {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: accessGrants.role,
    })
    .from(user)
    .innerJoin(
      accessGrants,
      // Normalized on both sides, matching `normalizeEmail`: a grant is stored
      // normalized, so comparing a raw user email would silently miss.
      eq(sql`lower(btrim(${user.email}))`, accessGrants.email),
    )
    .orderBy(asc(user.createdAt));
});
