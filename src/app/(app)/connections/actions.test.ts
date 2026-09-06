import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessAction } from "@/lib/auth/policy";

const authorizedViewedAccountId =
  vi.fn<(action: AccessAction) => Promise<string | null>>();

const evm = vi.hoisted(() => ({
  addUserEvmAccount: vi.fn(),
  getUserEvmAccounts: vi.fn(),
  removeUserEvmAccount: vi.fn(),
  renameUserEvmAccount: vi.fn(),
}));
const kraken = vi.hoisted(() => ({
  getUserKrakenAccounts: vi.fn(),
  removeUserKrakenAccount: vi.fn(),
  saveUserKrakenCredentials: vi.fn(),
}));
const plaidItems = vi.hoisted(() => ({
  getUserPlaidItems: vi.fn(),
  getUserBrokeragePlaidItems: vi.fn(),
  PlaidRevokeError: class PlaidRevokeError extends Error {},
  removeUserPlaidItem: vi.fn(),
  upsertPlaidItem: vi.fn(),
}));

// The action module pulls in provider modules that reach for the database at
// import time; the seam under test is the authorization call, not the queries.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/authorize", () => ({
  authorizedViewedAccountId: (action: AccessAction) =>
    authorizedViewedAccountId(action),
}));
vi.mock("@/lib/evm/accounts", () => evm);
vi.mock("@/lib/exchange/kraken/accounts", () => kraken);
vi.mock("@/lib/exchange/kraken/balances", () => ({
  syncKrakenAccounts: vi.fn(),
}));
vi.mock("@/lib/plaid/items", () => plaidItems);
vi.mock("@/lib/brokerage/connections", () => ({
  getUserSchwabConnections: vi.fn().mockResolvedValue([]),
  removeUserSchwabConnection: vi.fn(),
}));
vi.mock("@/lib/lighter/accounts", () => ({
  connectLighterAccount: vi.fn(),
  getUserLighterAccounts: vi.fn().mockResolvedValue([]),
  removeLighterAccount: vi.fn(),
}));
vi.mock("@/lib/manual-balance/items", () => ({
  createManualBalanceItem: vi.fn(),
  getUserManualBalanceItems: vi.fn().mockResolvedValue([]),
  removeUserManualBalanceItem: vi.fn(),
  updateUserManualBalanceItem: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));

const {
  addWallets,
  getAccountConnections,
  removePlaidItem,
  removeWallet,
  saveKrakenCredentials,
} = await import("@/app/(app)/connections/actions");

beforeEach(() => {
  vi.clearAllMocks();
  evm.getUserEvmAccounts.mockResolvedValue([]);
  evm.addUserEvmAccount.mockResolvedValue({ error: null });
  kraken.saveUserKrakenCredentials.mockResolvedValue({ id: "kraken-1" });
  plaidItems.getUserPlaidItems.mockResolvedValue([]);
});

describe("provider configuration against a foreign account", () => {
  // The seam answers 403 via `forbidden()`, so a refused configuration never
  // reaches a provider call — with either account's id.
  beforeEach(() => {
    authorizedViewedAccountId.mockRejectedValue(new Error("FORBIDDEN"));
  });

  it("refuses to add a wallet", async () => {
    await expect(addWallets("0xabc", "Cold")).rejects.toThrow("FORBIDDEN");

    expect(evm.addUserEvmAccount).not.toHaveBeenCalled();
  });

  it("refuses to store exchange credentials", async () => {
    await expect(
      saveKrakenCredentials({ apiKey: "key", apiSecret: "secret" }),
    ).rejects.toThrow("FORBIDDEN");

    expect(kraken.saveUserKrakenCredentials).not.toHaveBeenCalled();
  });

  it("refuses to unlink a brokerage connection", async () => {
    await expect(removePlaidItem("item-1")).rejects.toThrow("FORBIDDEN");

    expect(plaidItems.removeUserPlaidItem).not.toHaveBeenCalled();
  });
});

describe("provider configuration the policy allows", () => {
  beforeEach(() => {
    authorizedViewedAccountId.mockResolvedValue("member");
  });

  // An admin maintaining the other account configures *that* account.
  it("adds a wallet to the viewed account", async () => {
    await addWallets("0xabc", "Cold");

    expect(authorizedViewedAccountId).toHaveBeenCalledWith("manageConnections");
    expect(evm.addUserEvmAccount).toHaveBeenCalledWith(
      "member",
      "0xabc",
      "Cold",
    );
  });

  it("removes a wallet from the viewed account", async () => {
    await removeWallet("0xabc");

    expect(evm.removeUserEvmAccount).toHaveBeenCalledWith("member", "0xabc");
  });
});

describe("provider configuration without a session", () => {
  it("reports the signed-out state rather than configuring anything", async () => {
    authorizedViewedAccountId.mockResolvedValue(null);

    const result = await addWallets("0xabc", "Cold");

    expect(evm.addUserEvmAccount).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});

describe("reading connections", () => {
  // Listing what is connected is a read, so it must not ask for configuration
  // authority the viewer may not have.
  it("lists the viewed account's connections without write authority", async () => {
    // "read" resolves; anything stronger would be refused for this viewer.
    authorizedViewedAccountId.mockImplementation(async (action) => {
      if (action !== "read") throw new Error("FORBIDDEN");
      return "admin";
    });
    kraken.getUserKrakenAccounts.mockResolvedValue([]);

    const result = await getAccountConnections();

    expect(result.error).toBeNull();
  });
});
