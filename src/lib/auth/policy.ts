/**
 * The whole authorization matrix for a Closed Instance, in one place (ADR 0005).
 *
 * Two things are always separate here: the *actor* (the signed-in user, proven
 * by the session) and the *target* (the account whose data is being touched,
 * which View As can point elsewhere). Selecting an account to look at is a data
 * context, never a grant of authority — every call site asks this module.
 *
 * Deliberately pure and free of `server-only` so the client can render the same
 * capabilities the server enforces. The server checks remain authoritative.
 */

export const ACCESS_ROLES = ["admin", "member"] as const;

export type AccessRole = (typeof ACCESS_ROLES)[number];

export const ACCESS_ACTIONS = [
  "read",
  "write",
  "refresh",
  "manageConnections",
] as const;

export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/** A user with an active grant. `null` means the grant is missing or deleted. */
export type AccessGrantee = {
  userId: string;
  role: AccessRole;
};

export function can(
  action: AccessAction,
  { actor, target }: { actor: AccessGrantee | null; target: AccessGrantee | null },
): boolean {
  // Default deny: an ungranted actor has no authority, and no authority reaches
  // an ungranted account. Revoking either end takes effect on the next request.
  if (!actor || !target) return false;

  switch (action) {
    // Granted users share reading, and either of them may bring either account
    // current — refresh only re-reads what a provider already holds.
    case "read":
    case "refresh":
      return true;
    // Persisting anything, including the connections and credentials that
    // decide what gets synced, follows account ownership.
    case "write":
    case "manageConnections":
      return actor.role === "admin" || actor.userId === target.userId;
  }
}

export type ViewedAccountCapabilities = {
  canWrite: boolean;
  canManageConnections: boolean;
};

/**
 * The capability summary the UI needs to render the account on screen: only
 * what changes the rendering. Refreshing is absent on purpose — every viewer of
 * a granted account may do it, so a control gated on it would look guarded
 * while never denying anything.
 */
export function viewedAccountCapabilities(grantees: {
  actor: AccessGrantee | null;
  target: AccessGrantee | null;
}): ViewedAccountCapabilities {
  return {
    canWrite: can("write", grantees),
    canManageConnections: can("manageConnections", grantees),
  };
}
