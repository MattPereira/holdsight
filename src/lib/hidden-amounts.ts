/**
 * Hidden Amounts: a per-device display preference that blurs Sensitive Values
 * so the app can be screenshotted or screenshared without revealing holdings.
 *
 * The preference lives in a cookie rather than the database because it is a
 * property of the device and the moment, not of the account, and because the
 * server needs it during the initial render — a mask applied only after
 * hydration would flash the real values first.
 *
 * The store is deliberately narrow: `HIDDEN_AMOUNTS_COOKIE` and the class name
 * are the only things the rest of the app knows about it.
 */

export const HIDDEN_AMOUNTS_COOKIE = "holdsight_hidden_amounts";

/** Set on <html>, mirroring how next-themes applies the colour scheme. */
export const HIDDEN_AMOUNTS_CLASS = "hidden-amounts";

// A year. The preference must never expire on its own: a mask that silently
// disengages mid-screenshare is worse than no mask at all, so the only way out
// is a deliberate toggle.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isHiddenAmountsValue(value: string | undefined): boolean {
  return value === "1";
}

export function hiddenAmountsCookie(hidden: boolean): string {
  const maxAge = hidden ? MAX_AGE_SECONDS : 0;
  return `${HIDDEN_AMOUNTS_COOKIE}=${hidden ? "1" : "0"}; path=/; max-age=${maxAge}; samesite=lax`;
}
