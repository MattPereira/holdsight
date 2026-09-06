import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { getGrantedUsers } from "@/lib/auth/granted-users";
import type { AccessGrantee } from "@/lib/auth/policy";
import { resolveEffectiveUserId, VIEW_AS_COOKIE } from "@/lib/auth/view-as";

export const getCurrentSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * The signed-in user, ignoring View As and grants. Only for things that belong
 * to the session itself — signing out, or answering "who am I really?".
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}

/**
 * The signed-in user *and* the authority their grant carries, or `null` if the
 * grant is gone. Checked per request rather than at sign-in, so deleting a
 * grant cuts off an existing session immediately (ADR 0005).
 */
export const getCurrentActor = cache(async (): Promise<AccessGrantee | null> => {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return null;

  const actor = (await getGrantedUsers()).find(
    (user) => user.id === sessionUserId,
  );

  return actor ? { userId: actor.id, role: actor.role } : null;
});

/**
 * The account whose data is on screen: the signed-in user unless View As points
 * at another granted account. This is the default on purpose — a caller that
 * forgets View As exists still scopes to the account the sidebar claims to be
 * showing. It says nothing about what may be done to that account; ask
 * `@/lib/auth/policy` for that.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const actor = await getCurrentActor();
  if (!actor) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(VIEW_AS_COOKIE)?.value;
  if (!cookieValue) return actor.userId;

  return resolveEffectiveUserId({
    sessionUserId: actor.userId,
    cookieValue,
    users: await getGrantedUsers(),
  });
});
