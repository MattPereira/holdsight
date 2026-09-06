import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GrantedUser } from "@/lib/auth/user-summary";

const getSession = vi.fn();
const getGrantedUsers = vi.fn<() => Promise<GrantedUser[]>>();

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: () => getSession() } },
}));
vi.mock("@/lib/auth/granted-users", () => ({
  getGrantedUsers: () => getGrantedUsers(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { getCurrentActor } = await import("@/lib/auth/session");

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
