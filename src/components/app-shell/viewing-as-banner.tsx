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
 * when the signed-in user is looking at their own account — which can still be
 * read-only, if their grant was demoted mid-session.
 */
export function ViewingAsBanner({
  viewingAs,
  canWrite,
}: {
  viewingAs: string | null;
  canWrite: boolean;
}) {
  if (!viewingAs && canWrite) return null;

  const label = viewingAs
    ? `Viewing as ${viewingAs}${canWrite ? "" : " — read only"}`
    : "Read only";

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
