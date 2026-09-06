import "server-only";

import { cache } from "react";
import { asc } from "drizzle-orm";

import { db } from "@/db/index";
import { user } from "@/db/schema/auth";
import type { UserSummary } from "@/lib/auth/user-summary";

/**
 * Every approved user on this instance, unfiltered: a row can only exist if its
 * email passed `ALLOWED_EMAILS` when the user first signed in, so re-filtering
 * here would just re-derive what the write path already enforces. The one gap —
 * an email removed from the allowlist after signup — is closed where it
 * belongs, in `resolveEffectiveUserId`.
 *
 * Cached so the effective-user lookup and the sidebar cannot read two different
 * snapshots of the same request.
 */
export const getSwitchableUsers = cache(async (): Promise<UserSummary[]> => {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .orderBy(asc(user.createdAt));
});
