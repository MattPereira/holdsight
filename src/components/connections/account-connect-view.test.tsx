import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountConnectionsResult } from "@/app/(app)/connections/actions";
import { ViewedAccountProvider } from "@/components/auth/viewed-account-context";
import { AccountConnectView } from "@/components/connections/account-connect-view";

vi.mock("@/app/(app)/connections/actions", () => ({
  addWallets: vi.fn(),
  createPlaidAccountsLinkToken: vi.fn(),
  linkPlaidAccounts: vi.fn(),
  removeKrakenAccount: vi.fn(),
  removeLighterConnection: vi.fn(),
  removeManualBalanceItem: vi.fn(),
  removePlaidItem: vi.fn(),
  removeSchwabConnection: vi.fn(),
  removeWallet: vi.fn(),
  renameWallet: vi.fn(),
  saveKrakenCredentials: vi.fn(),
  saveLighterConnection: vi.fn(),
  addManualBalanceItem: vi.fn(),
  updateManualBalanceItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const connections: AccountConnectionsResult = {
  wallets: [
    {
      id: "wallet-1",
      address: "0xabc",
      label: "Cold wallet",
      syncStatus: "success",
      syncHttpStatus: null,
      syncErrorMessage: null,
    },
  ],
  lighterAccounts: [],
  krakenAccounts: [],
  plaidItems: [],
  schwabConnections: [],
  schwabConfigured: false,
  manualItems: [],
  error: null,
};

function renderView(canManageConnections: boolean) {
  return render(
    <ViewedAccountProvider
      capabilities={{ canWrite: false, canManageConnections }}
    >
      <AccountConnectView connections={connections} />
    </ViewedAccountProvider>,
  );
}

afterEach(cleanup);

describe("connections for an account the viewer may not configure", () => {
  it("lists what is connected without any control that would be refused", () => {
    renderView(false);

    expect(screen.getByText("Cold wallet")).toBeDefined();
    expect(screen.getByText("0xabc")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove 0xabc/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rename 0xabc/ })).toBeNull();
  });
});

describe("connections the viewer may configure", () => {
  it("offers the mutation controls", () => {
    renderView(true);

    expect(screen.getByRole("button", { name: "Connect" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Remove 0xabc/ })).toBeDefined();
  });
});
