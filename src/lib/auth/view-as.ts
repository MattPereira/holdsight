import "server-only";

import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import type { UserSummary } from "@/lib/auth/user-summary";

/**
 * View As: which approved user's data the current device is looking at.
 *
 * Holdsight instances are shared by a handful of approved users who keep their
 * finances separate (ADR 0005). This lets one of them look at another's
 * portfolio without signing out, so the selection is an access decision, not a
 * display preference: the cookie is httpOnly and only a server action sets it.
 *
 * It lives in a cookie rather than on the user row because it is a property of
 * the device, not the account.
 */

export const VIEW_AS_COOKIE = "holdsight_view_as";

// Matches the Hidden Amounts cookie. The session binding below is what keeps
// this safe, not expiry.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const VIEW_AS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
} as const;

export type ViewAs = {
  /** Who was signed in when the switch was made. */
  sessionUserId: string;
  /** Whose data they asked to see. */
  targetUserId: string;
};

const SEPARATOR = ":";

/**
 * The cookie names both ends of the switch, not just the target. Signing out
 * cannot clear an httpOnly cookie from the client, so without the session end
 * a stale cookie would silently apply to whoever signed in next on that device.
 * Binding it means a changed identity invalidates the switch on its own.
 */
export function serializeViewAs({ sessionUserId, targetUserId }: ViewAs): string {
  return `${sessionUserId}${SEPARATOR}${targetUserId}`;
}

export function parseViewAs(value: string | undefined): ViewAs | null {
  const [sessionUserId, targetUserId, ...rest] = (value ?? "").split(SEPARATOR);
  if (!sessionUserId || !targetUserId || rest.length > 0) return null;
  return { sessionUserId, targetUserId };
}

/**
 * Re-checks the allowlist on every render rather than trusting the cookie.
 * The allowlist is only enforced when a user signs up or opens a session, so a
 * user removed from `ALLOWED_EMAILS` keeps their row — and switching creates no
 * session that would catch them. This is where that gap closes.
 */
export function resolveEffectiveUserId({
  sessionUserId,
  cookieValue,
  users,
  allowedEmails,
}: {
  sessionUserId: string;
  cookieValue: string | undefined;
  users: readonly UserSummary[];
  allowedEmails: ReadonlySet<string>;
}): string {
  const viewAs = parseViewAs(cookieValue);
  if (!viewAs) return sessionUserId;
  if (viewAs.sessionUserId !== sessionUserId) return sessionUserId;
  if (viewAs.targetUserId === sessionUserId) return sessionUserId;

  const target = users.find((user) => user.id === viewAs.targetUserId);
  if (!target || !isEmailAllowed(target.email, allowedEmails)) {
    return sessionUserId;
  }

  return viewAs.targetUserId;
}
