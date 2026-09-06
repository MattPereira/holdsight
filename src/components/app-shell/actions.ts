"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getGrantedUsers } from "@/lib/auth/granted-users";
import { getCurrentActor } from "@/lib/auth/session";
import {
  resolveEffectiveUserId,
  serializeViewAs,
  VIEW_AS_COOKIE,
  VIEW_AS_COOKIE_OPTIONS,
} from "@/lib/auth/view-as";

export async function switchViewAs(targetUserId: string): Promise<void> {
  // The actor, not merely the session: switching is the one mutation whose own
  // authority comes from the grant behind the session, so a revoked user with a
  // live session cannot even write the cookie (ADR 0005).
  const actor = await getCurrentActor();
  if (!actor) redirect("/");
  const sessionUserId = actor.userId;

  // Resolve the cookie we are about to write with the same rule the renderer
  // applies to it, so a target the resolver would reject is never stored.
  const cookieValue = serializeViewAs({ sessionUserId, targetUserId });
  const effectiveUserId = resolveEffectiveUserId({
    sessionUserId,
    cookieValue,
    users: await getGrantedUsers(),
  });

  const cookieStore = await cookies();
  if (effectiveUserId === sessionUserId) {
    cookieStore.delete(VIEW_AS_COOKIE);
  } else {
    cookieStore.set(VIEW_AS_COOKIE, cookieValue, VIEW_AS_COOKIE_OPTIONS);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
