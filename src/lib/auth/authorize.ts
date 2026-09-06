import "server-only";

import { forbidden } from "next/navigation";

import { getGrantedUsers } from "@/lib/auth/granted-users";
import {
  can,
  viewedAccountCapabilities,
  type AccessAction,
  type AccessGrantee,
  type ViewedAccountCapabilities,
} from "@/lib/auth/policy";
import { getCurrentActor, getCurrentUserId } from "@/lib/auth/session";

/**
 * The one place a server mutation asks "may the signed-in user do this to the
 * account currently on screen?".
 *
 * `forbidden` carries the *viewed* account, not the actor's own: a denied
 * caller may still read what it is looking at, but nothing here ever hands back
 * an id that would let it write somewhere else instead (ADR 0005).
 */
export type ViewedAccountAuthorization =
  | { status: "authorized"; userId: string }
  | { status: "unauthenticated" }
  | { status: "forbidden"; userId: string };

async function grantees(): Promise<{
  actor: AccessGrantee | null;
  target: AccessGrantee | null;
}> {
  const [actor, targetUserId, users] = await Promise.all([
    getCurrentActor(),
    getCurrentUserId(),
    getGrantedUsers(),
  ]);
  const target = users.find((user) => user.id === targetUserId);

  return {
    actor,
    target: target ? { userId: target.id, role: target.role } : null,
  };
}

export async function authorizeViewedAccount(
  action: AccessAction,
): Promise<ViewedAccountAuthorization> {
  const { actor, target } = await grantees();
  // No actor or no viewable account is an admission problem, not a permission
  // one: the caller has nothing to be denied *for*.
  if (!actor || !target) return { status: "unauthenticated" };

  return can(action, { actor, target })
    ? { status: "authorized", userId: target.userId }
    : { status: "forbidden", userId: target.userId };
}

/**
 * The viewed account when the signed-in user may take `action` on it, or `null`
 * when nobody is signed in. A member aiming at the other account never gets a
 * value back: `forbidden()` answers 403, so no caller can fall back to acting
 * on the actor's own account instead (ADR 0005).
 *
 * Refreshing and starting a Transaction History Sync pass "refresh", which any
 * granted user may do to either account; persisting anything — including the
 * connections and credentials that decide what gets synced — does not.
 */
export async function authorizedViewedAccountId(
  action: AccessAction,
): Promise<string | null> {
  const authorization = await authorizeViewedAccount(action);
  if (authorization.status === "forbidden") forbidden();
  return authorization.status === "authorized" ? authorization.userId : null;
}

/** What the client may render for the account on screen. Server checks stand. */
export async function getViewedAccountCapabilities(): Promise<ViewedAccountCapabilities> {
  return viewedAccountCapabilities(await grantees());
}
