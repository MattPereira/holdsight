import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { getGrantedUsers } from "@/lib/auth/granted-users";
import type { AccessGrantee } from "@/lib/auth/policy";

/**
 * Who is signed in, and nothing else.
 *
 * The account whose data is on screen lives in `@/lib/auth/authorize`, which is
 * the only module that pairs the two. Keeping them apart is what stops a call
 * site from reaching for an identity without saying what it intends to do with
 * it (ADR 0005).
 */

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
