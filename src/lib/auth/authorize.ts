import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden } from "next/navigation";

import { getGrantedUsers } from "@/lib/auth/granted-users";
import {
  can,
  viewedAccountCapabilities,
  type AccessAction,
  type AccessGrantee,
  type ViewedAccountCapabilities,
} from "@/lib/auth/policy";
import { getCurrentActor } from "@/lib/auth/session";
import { resolveEffectiveUserId, VIEW_AS_COOKIE } from "@/lib/auth/view-as";

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

/**
 * The account whose data is on screen: the signed-in user unless View As points
 * at another still-granted account. Deliberately not exported — a viewed
 * account is only ever handed out through an authorized action below, so no
 * call site can scope to it without naming what it means to do.
 */
const viewedAccount = cache(async (): Promise<AccessGrantee | null> => {
  // Nothing is on screen for a signed-out request, so it never reaches the
  // grants query — `getCurrentActor` has already made and cached that call for
  // every request that does.
  const actor = await getCurrentActor();
  if (!actor) return null;

  const users = await getGrantedUsers();
  const targetUserId = resolveEffectiveUserId({
    sessionUserId: actor.userId,
    cookieValue: (await cookies()).get(VIEW_AS_COOKIE)?.value,
    users,
  });
  const target = users.find((user) => user.id === targetUserId);

  return target ? { userId: target.id, role: target.role } : null;
});

async function grantees(): Promise<{
  actor: AccessGrantee | null;
  target: AccessGrantee | null;
}> {
  const [actor, target] = await Promise.all([
    getCurrentActor(),
    viewedAccount(),
  ]);

  return { actor, target };
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
