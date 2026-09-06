import { RiEyeLine } from "@remixicon/react";

/**
 * The one place the app says whose data is on screen and whether it can be
 * changed (ADR 0005).
 *
 * Individual surfaces already drop the controls a member would be refused, but
 * an absent button explains nothing. This sits in the app header, so the answer
 * is on every page rather than only the ones with something to edit.
 *
 * `viewingAs` is the other account's name while View As is active, and `null`
 * on the signed-in user's own account, which stays quiet: their own account is
 * writable for as long as they hold any grant at all, and losing the grant
 * replaces the whole app with the revoked notice.
 */
export function ViewingAsBanner({
  viewingAs,
  canWrite,
}: {
  viewingAs: string | null;
  canWrite: boolean;
}) {
  if (!viewingAs) return null;

  const label = `Viewing as ${viewingAs}${canWrite ? "" : " — read only"}`;

  return (
    <div
      role="status"
      className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
    >
      <RiEyeLine aria-hidden className="size-3.5" />
      {label}
    </div>
  );
}
