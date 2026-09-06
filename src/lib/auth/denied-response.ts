import type { ViewedAccountAuthorization } from "@/lib/auth/authorize";

/**
 * How a route answers an authorization it did not get. A refused write is told
 * so — 403, not a redirect and not a quiet substitution of the caller's own
 * account, which would hide the refusal (ADR 0005).
 */
export function deniedResponse(
  authorization: Exclude<ViewedAccountAuthorization, { status: "authorized" }>,
): Response {
  return authorization.status === "unauthenticated"
    ? Response.json({ error: "Unauthorized" }, { status: 401 })
    : Response.json({ error: "Forbidden" }, { status: 403 });
}
