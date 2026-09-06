import { describe, expect, it } from "vitest";

import {
  parseViewAs,
  resolveEffectiveUserId,
  serializeViewAs,
} from "@/lib/auth/view-as";
import type { GrantedUser } from "@/lib/auth/user-summary";

// Grant-filtered, as `getGrantedUsers` returns it: "revoked" still has a user
// row, but its grant was deleted, so it never appears here.
const users: GrantedUser[] = [
  { id: "me", name: "Me", email: "me@example.com", role: "member" },
  { id: "dad", name: "Dad", email: "dad@example.com", role: "admin" },
];

function resolve(cookieValue: string | undefined) {
  return resolveEffectiveUserId({
    sessionUserId: "me",
    cookieValue,
    users,
  });
}

function viewing(targetUserId: string, sessionUserId = "me") {
  return serializeViewAs({ sessionUserId, targetUserId });
}

describe("view as cookie", () => {
  it("round-trips both ends of the switch", () => {
    const value = serializeViewAs({ sessionUserId: "me", targetUserId: "dad" });

    expect(value).toBe("me:dad");
    expect(parseViewAs(value)).toEqual({
      sessionUserId: "me",
      targetUserId: "dad",
    });
  });

  it.each([undefined, "", "me", "me:", ":dad", "me:dad:extra"])(
    "rejects the malformed value %j",
    (value) => {
      expect(parseViewAs(value)).toBeNull();
    },
  );
});

describe("resolveEffectiveUserId", () => {
  it("falls back to the session user when nothing is requested", () => {
    expect(resolve(undefined)).toBe("me");
  });

  it("returns the requested user when their grant is still active", () => {
    expect(resolve(viewing("dad"))).toBe("dad");
  });

  it("falls back when the requested user no longer exists", () => {
    expect(resolve(viewing("deleted"))).toBe("me");
  });

  it("falls back when the requested user's grant was deleted", () => {
    expect(resolve(viewing("revoked"))).toBe("me");
  });

  it("returns the session user when they request themselves", () => {
    expect(resolve(viewing("me"))).toBe("me");
  });

  // Signing out cannot clear an httpOnly cookie, so a switch left behind on a
  // shared device must not follow the next person to sign in.
  it("ignores a switch made by a different session user", () => {
    expect(resolve(viewing("dad", "someone-else"))).toBe("me");
  });
});
