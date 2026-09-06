import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GrantedUser } from "@/lib/auth/user-summary";
import { serializeViewAs, VIEW_AS_COOKIE } from "@/lib/auth/view-as";

const getCurrentActor = vi.fn();
const getGrantedUsers = vi.fn<() => Promise<GrantedUser[]>>();
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock("@/lib/auth/session", () => ({
  getCurrentActor: () => getCurrentActor(),
}));
vi.mock("@/lib/auth/granted-users", () => ({
  getGrantedUsers: () => getGrantedUsers(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// `redirect` throws in Next so nothing after it runs; the throw is what proves
// a denied switch stopped before writing anything.
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("REDIRECT");
  },
}));

const { switchViewAs } = await import("@/components/app-shell/actions");

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

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentActor.mockResolvedValue({ userId: me.id, role: me.role });
  getGrantedUsers.mockResolvedValue([me, dad]);
});

describe("switchViewAs", () => {
  it("stores the switch when the target still holds a grant", async () => {
    await expect(switchViewAs("dad")).rejects.toThrow("REDIRECT");

    expect(cookieStore.set).toHaveBeenCalledWith(
      VIEW_AS_COOKIE,
      serializeViewAs({ sessionUserId: "me", targetUserId: "dad" }),
      expect.anything(),
    );
  });

  it("clears the cookie when switching back to your own account", async () => {
    await expect(switchViewAs("me")).rejects.toThrow("REDIRECT");

    expect(cookieStore.delete).toHaveBeenCalledWith(VIEW_AS_COOKIE);
  });

  // Never stored, rather than stored and ignored later: the resolver would
  // refuse it anyway, and a cookie nobody honours is a lie about the state.
  it("refuses a target whose grant is gone", async () => {
    getGrantedUsers.mockResolvedValue([me]);

    await expect(switchViewAs("dad")).rejects.toThrow("REDIRECT");

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).toHaveBeenCalledWith(VIEW_AS_COOKIE);
  });

  // Switching is authority of its own, so it dies with the actor's grant even
  // though the authentication session is still valid.
  it("refuses to switch once the actor's grant is deleted", async () => {
    getCurrentActor.mockResolvedValue(null);

    await expect(switchViewAs("dad")).rejects.toThrow("REDIRECT");

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});
