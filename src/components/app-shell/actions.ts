"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getGrantedUsers } from "@/lib/auth/granted-users";
import { getSessionUserId } from "@/lib/auth/session";
import {
  resolveEffectiveUserId,
  serializeViewAs,
  VIEW_AS_COOKIE,
  VIEW_AS_COOKIE_OPTIONS,
} from "@/lib/auth/view-as";

export async function switchViewAs(targetUserId: string): Promise<void> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/");

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
