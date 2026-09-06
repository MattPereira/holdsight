import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { approvedEmails } from "@/lib/auth/approved-emails";
import { getSwitchableUsers } from "@/lib/auth/switchable-users";
import { resolveEffectiveUserId, VIEW_AS_COOKIE } from "@/lib/auth/view-as";

export const getCurrentSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * The signed-in user, ignoring View As. Only for things that belong to the
 * session itself — signing out, or answering "who am I really?". Anything that
 * reads or writes portfolio data wants `getCurrentUserId` instead.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}

/**
 * The user whose data is on screen: the signed-in user unless View As points
 * somewhere else. This is the default on purpose — a caller that forgets View
 * As exists still scopes to the account the sidebar claims to be showing.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(VIEW_AS_COOKIE)?.value;
  if (!cookieValue) return sessionUserId;

  return resolveEffectiveUserId({
    sessionUserId,
    cookieValue,
    users: await getSwitchableUsers(),
    allowedEmails: approvedEmails,
  });
});
