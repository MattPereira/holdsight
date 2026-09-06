import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GrantedUser } from "@/lib/auth/user-summary";
import { serializeViewAs } from "@/lib/auth/view-as";

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

const { getCurrentActor, getCurrentUserId } = await import(
  "@/lib/auth/session"
);

const me: GrantedUser = {
  id: "me",
  name: "Me",
  email: "me@example.com",
  role: "member",
};
const dad: GrantedUser = {
  id: "dad",
  name: "Dad",
  email: "dad@example.com",
  role: "admin",
};

function signedInAs(userId: string) {
  getSession.mockResolvedValue({ user: { id: userId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  getGrantedUsers.mockResolvedValue([me, dad]);
  cookieValue.mockReturnValue(undefined);
});

describe("getCurrentActor", () => {
  it("reports the signed-in user's role", async () => {
    signedInAs("dad");

    await expect(getCurrentActor()).resolves.toEqual({
      userId: "dad",
      role: "admin",
    });
  });

  it("has no actor when nobody is signed in", async () => {
    getSession.mockResolvedValue(null);

    await expect(getCurrentActor()).resolves.toBeNull();
  });

  // The grant is re-read per request rather than trusted from sign-in, so
  // deleting it cuts off a session that is otherwise still valid.
  it("has no actor once the signed-in user's grant is deleted", async () => {
    signedInAs("me");
    getGrantedUsers.mockResolvedValue([dad]);

    await expect(getCurrentActor()).resolves.toBeNull();
  });
});

describe("getCurrentUserId", () => {
  it("scopes to the signed-in user by default", async () => {
    signedInAs("me");

    await expect(getCurrentUserId()).resolves.toBe("me");
  });

  it("scopes to the viewed account while View As is active", async () => {
    signedInAs("me");
    cookieValue.mockReturnValue(
      serializeViewAs({ sessionUserId: "me", targetUserId: "dad" }),
    );

    await expect(getCurrentUserId()).resolves.toBe("dad");
  });

  // Every read and write scopes by this, so denying here denies all of them.
  it("scopes to nobody once the actor's grant is deleted", async () => {
    signedInAs("me");
    getGrantedUsers.mockResolvedValue([dad]);
    cookieValue.mockReturnValue(
      serializeViewAs({ sessionUserId: "me", targetUserId: "dad" }),
    );

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it("falls back to the actor once the viewed account's grant is deleted", async () => {
    signedInAs("me");
    getGrantedUsers.mockResolvedValue([me]);
    cookieValue.mockReturnValue(
      serializeViewAs({ sessionUserId: "me", targetUserId: "dad" }),
    );

    await expect(getCurrentUserId()).resolves.toBe("me");
  });
});
