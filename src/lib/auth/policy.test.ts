import { describe, expect, it } from "vitest";

import {
  ACCESS_ACTIONS,
  can,
  viewedAccountCapabilities,
  type AccessGrantee,
} from "@/lib/auth/policy";

const admin: AccessGrantee = { userId: "admin", role: "admin" };
const member: AccessGrantee = { userId: "member", role: "member" };

describe("can", () => {
  it.each(ACCESS_ACTIONS)("denies %s without an actor grant", (action) => {
    expect(can(action, { actor: null, target: member })).toBe(false);
  });

  it.each(ACCESS_ACTIONS)("denies %s without a target grant", (action) => {
    expect(can(action, { actor: admin, target: null })).toBe(false);
  });

  it.each(ACCESS_ACTIONS)("lets an admin %s their own account", (action) => {
    expect(can(action, { actor: admin, target: admin })).toBe(true);
  });

  it.each(ACCESS_ACTIONS)("lets an admin %s a member account", (action) => {
    expect(can(action, { actor: admin, target: member })).toBe(true);
  });

  it.each(ACCESS_ACTIONS)("lets a member %s their own account", (action) => {
    expect(can(action, { actor: member, target: member })).toBe(true);
  });

  it.each(["read", "refresh"] as const)(
    "lets a member %s a foreign account",
    (action) => {
      expect(can(action, { actor: member, target: admin })).toBe(true);
    },
  );

  it.each(["write", "manageConnections"] as const)(
    "stops a member from %s on a foreign account",
    (action) => {
      expect(can(action, { actor: member, target: admin })).toBe(false);
    },
  );
});

describe("viewedAccountCapabilities", () => {
  it("reports full authority for an admin viewing a member", () => {
    expect(viewedAccountCapabilities({ actor: admin, target: member })).toEqual({
      canWrite: true,
      canRefresh: true,
      canManageConnections: true,
    });
  });

  it("reports read-only, refreshable state for a member viewing an admin", () => {
    expect(viewedAccountCapabilities({ actor: member, target: admin })).toEqual({
      canWrite: false,
      canRefresh: true,
      canManageConnections: false,
    });
  });

  it("reports nothing when the actor's grant is gone", () => {
    expect(viewedAccountCapabilities({ actor: null, target: admin })).toEqual({
      canWrite: false,
      canRefresh: false,
      canManageConnections: false,
    });
  });
});
