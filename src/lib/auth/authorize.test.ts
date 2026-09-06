import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_ACTIONS, type AccessAction } from "@/lib/auth/policy";
import type { GrantedUser } from "@/lib/auth/user-summary";
import { serializeViewAs } from "@/lib/auth/view-as";

/**
 * The authorization chain end to end: a session, a View As cookie, and the
 * grants in the database resolve into an actor and a viewed account, and the
 * policy answers for that pair. Only the three real edges are stubbed — Better
 * Auth, the request's cookies, and the grants query — so a mistake anywhere in
 * between shows up here rather than being mocked away (ADR 0005).
 */
const getSession = vi.fn();
const getGrantedUsers = vi.fn<() => Promise<GrantedUser[]>>();
const cookieValue = vi.fn<() => string | undefined>();

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: () => getSession() } },
}));
vi.mock("@/lib/auth/granted-users", () => ({
  getGrantedUsers: () => getGrantedUsers(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => ({ value: cookieValue() }) }),
}));
// Next's real `forbidden()` throws an HTTP-access-fallback error the framework
// turns into a 403; the throw is what callers must not be able to swallow.
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

const {
  authorizeViewedAccount,
  getViewedAccountCapabilities,
  authorizedViewedAccountId,
} = await import("@/lib/auth/authorize");

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

/** Signs in as `user` and, when `viewing` differs, switches the account on screen. */
function signedInAs(user: GrantedUser, viewing: GrantedUser = user) {
  getSession.mockResolvedValue({ user: { id: user.id } });
  cookieValue.mockReturnValue(
    viewing.id === user.id
      ? undefined
      : serializeViewAs({ sessionUserId: user.id, targetUserId: viewing.id }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getGrantedUsers.mockResolvedValue([memberUser, adminUser]);
  getSession.mockResolvedValue(null);
  cookieValue.mockReturnValue(undefined);
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
    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("drops back to the actor's own account once the viewed grant is deleted", async () => {
    signedInAs(adminUser, memberUser);
    getGrantedUsers.mockResolvedValue([adminUser]);

    // The stale cookie does not point anywhere any more, so the admin is back
    // on their own account rather than authorized against a revoked one.
    await expect(authorizeViewedAccount("write")).resolves.toEqual({
      status: "authorized",
      userId: "admin",
    });
  });
});

/**
 * The full matrix, driven through the same chain a request uses. `read` and
 * `refresh` are shared across granted accounts; `write` and `manageConnections`
 * follow ownership unless the actor is an admin.
 */
describe("the actor-by-account matrix", () => {
  const cases: Array<{
    actor: GrantedUser;
    viewing: GrantedUser;
    allowed: readonly AccessAction[];
  }> = [
    { actor: adminUser, viewing: adminUser, allowed: ACCESS_ACTIONS },
    { actor: adminUser, viewing: memberUser, allowed: ACCESS_ACTIONS },
    { actor: memberUser, viewing: memberUser, allowed: ACCESS_ACTIONS },
    { actor: memberUser, viewing: adminUser, allowed: ["read", "refresh"] },
  ];

  for (const { actor, viewing, allowed } of cases) {
    const scope = viewing.id === actor.id ? "their own" : "a foreign";

    for (const action of ACCESS_ACTIONS) {
      const permitted = allowed.includes(action);

      it(`${permitted ? "lets" : "stops"} a ${actor.role} ${action} on ${scope} account`, async () => {
        signedInAs(actor, viewing);

        const result = authorizedViewedAccountId(action);

        if (permitted) {
          await expect(result).resolves.toBe(viewing.id);
        } else {
          await expect(result).rejects.toThrow("FORBIDDEN");
        }
      });
    }
  }

  // Revoking the actor's grant is the one case that denies everything, session
  // or no session: nothing is authorized and nothing is 403'd into a fallback.
  it.each(ACCESS_ACTIONS)(
    "hands back nothing for %s once the actor's grant is deleted",
    async (action) => {
      signedInAs(memberUser, adminUser);
      getGrantedUsers.mockResolvedValue([adminUser]);

      await expect(authorizedViewedAccountId(action)).resolves.toBeNull();
    },
  );

  it.each(ACCESS_ACTIONS)(
    "hands back nothing for %s when nobody is signed in",
    async (action) => {
      await expect(authorizedViewedAccountId(action)).resolves.toBeNull();
    },
  );
});

describe("authorizedViewedAccountId", () => {
  // A cookie written before a sign-out would otherwise apply to whoever signs
  // in next on the device.
  it("ignores a View As cookie left behind by another session", async () => {
    getSession.mockResolvedValue({ user: { id: "member" } });
    cookieValue.mockReturnValue(
      serializeViewAs({ sessionUserId: "someone-else", targetUserId: "admin" }),
    );

    await expect(authorizedViewedAccountId("write")).resolves.toBe("member");
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

  // Nothing renders a mutation control for a revoked actor.
  it("reports no authority once the actor's grant is deleted", async () => {
    signedInAs(memberUser, adminUser);
    getGrantedUsers.mockResolvedValue([adminUser]);

    await expect(getViewedAccountCapabilities()).resolves.toEqual({
      canWrite: false,
      canRefresh: false,
      canManageConnections: false,
    });
  });
});
