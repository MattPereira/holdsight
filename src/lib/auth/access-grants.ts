import "server-only";

import { emailNotAllowedError } from "@/lib/auth/access-error";
import type { AccessRole } from "@/lib/auth/policy";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AccessGrantLookup = (email: string) => Promise<AccessRole | null>;

/**
 * The admission gate: no grant, no account and no session. Kept apart from the
 * query that backs it so the rule can be tested without a database, and so
 * Better Auth's hooks and the app share one definition of "admitted".
 */
export async function requireAccessGrant(
  lookup: AccessGrantLookup,
  email: string,
): Promise<AccessRole> {
  const role = await lookup(email);
  if (!role) throw emailNotAllowedError();
  return role;
}
