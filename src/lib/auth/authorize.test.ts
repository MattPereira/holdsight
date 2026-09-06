import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GrantedUser } from "@/lib/auth/user-summary";

const getCurrentActor = vi.fn();
const getCurrentUserId = vi.fn<() => Promise<string | null>>();
const getGrantedUsers = vi.fn<() => Promise<GrantedUser[]>>();

vi.mock("@/lib/auth/session", () => ({
  getCurrentActor: () => getCurrentActor(),
  getCurrentUserId: () => getCurrentUserId(),
}));
vi.mock("@/lib/auth/granted-users", () => ({
  getGrantedUsers: () => getGrantedUsers(),
}));

const { authorizeViewedAccount, getViewedAccountCapabilities } = await import(
  "@/lib/auth/authorize"
);

const memberUser: GrantedUser = {
  id: "member",
  name: "Member",
  email: "member@example.com",
  role: "member",
};
const adminUser: GrantedUser = {
  id: "admin",
  name: "Admin",
  email: "admin@example.com",
  role: "admin",
};

function signedInAs(user: GrantedUser, viewing: GrantedUser = user) {
  getCurrentActor.mockResolvedValue({ userId: user.id, role: user.role });
  getCurrentUserId.mockResolvedValue(viewing.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  getGrantedUsers.mockResolvedValue([memberUser, adminUser]);
});

describe("authorizeViewedAccount", () => {
  it("authorizes a member writing their own account", async () => {
    signedInAs(memberUser);

    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "authorized",
      userId: "member",
    });
  });

  it("authorizes an admin writing a foreign account", async () => {
    signedInAs(adminUser, memberUser);

    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "authorized",
      userId: "member",
    });
  });

  // The viewed account is reported back so a denied caller can still read it —
  // never so it can be swapped for the actor's own account and mutated.
  it("forbids a member writing the account they are viewing", async () => {
    signedInAs(memberUser, adminUser);

    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "forbidden",
      userId: "admin",
    });
  });

  it("still lets a member read the account they are viewing", async () => {
    signedInAs(memberUser, adminUser);

    await expect(authorizeViewedAccount("read")).resolves.toEqual({
      status: "authorized",
      userId: "admin",
    });
  });

  it("reports no session when nobody is signed in", async () => {
    getCurrentActor.mockResolvedValue(null);
    getCurrentUserId.mockResolvedValue(null);

    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("reports no session once the viewed account's grant is deleted", async () => {
    signedInAs(adminUser, memberUser);
    getGrantedUsers.mockResolvedValue([adminUser]);

    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "unauthenticated",
    });
  });
});

describe("getViewedAccountCapabilities", () => {
  it("reports read-only state for a member viewing a foreign account", async () => {
    signedInAs(memberUser, adminUser);

    await expect(getViewedAccountCapabilities()).resolves.toEqual({
      canWrite: false,
      canRefresh: true,
      canManageConnections: false,
    });
  });

  it("reports full authority for an admin viewing a foreign account", async () => {
    signedInAs(adminUser, memberUser);

    await expect(getViewedAccountCapabilities()).resolves.toEqual({
      canWrite: true,
      canRefresh: true,
      canManageConnections: true,
    });
  });
});
