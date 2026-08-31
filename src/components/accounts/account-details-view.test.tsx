import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountDetailsView } from "@/components/accounts/account-details-view";
import { WALLET_SECONDARY_COLUMN } from "@/components/accounts/balances/groups";
import { PlansProvider } from "@/components/portfolio/plans-context";
import type { BalancesView } from "@/lib/accounts/balances-view";

// The transactions tab statically pulls in server actions (auth/db at load
// time). This view test only exercises the balances half, so stub the tab.
vi.mock(
  "@/components/accounts/transactions/transactions-tab-content",
  () => ({ TransactionsTabContent: () => null }),
);

// The allocations strip renders recharts, which leaves observers alive and
// slows worker teardown. It's irrelevant to the balances-groups behavior here.
vi.mock("@/components/portfolio/portfolio-allocations", () => ({
  PortfolioAllocations: () => null,
}));

function balancesView(symbol: string): BalancesView {
  return {
    groups: [
      {
        key: "g1",
        title: "Main Wallet",
        rows: [
          {
            key: "r1",
            symbol,
            secondary: "ethereum",
            amount: 1,
            priceUsd: 100,
            valueUsd: 100,
          },
        ],
        total: 100,
      },
    ],
    summary: { grandTotalValue: 100, totals: [] },
    error: null,
  };
}

function renderView(props: Parameters<typeof AccountDetailsView>[0]) {
  return render(
    <PlansProvider initialPlans={[]}>
      <AccountDetailsView {...props} />
    </PlansProvider>,
  );
}

afterEach(cleanup);

describe("AccountDetailsView", () => {
  it("renders the injected balances snapshot and swaps it on refresh", async () => {
    const refreshBalancesAction = vi.fn(async () => balancesView("BTC"));
    renderView({
      title: "Wallets",
      secondaryColumn: WALLET_SECONDARY_COLUMN,
      initialBalances: balancesView("ETH"),
      refreshBalancesAction,
    });

    expect(screen.getAllByText("ETH").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect((await screen.findAllByText("BTC")).length).toBeGreaterThan(0);
    expect(refreshBalancesAction).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByText("ETH")).toHaveLength(0);
  });

  it("surfaces a balances sync error from the snapshot", () => {
    renderView({
      title: "Wallets",
      secondaryColumn: WALLET_SECONDARY_COLUMN,
      initialBalances: { ...balancesView("ETH"), error: "Sync failed." },
      refreshBalancesAction: vi.fn(),
    });

    expect(screen.getByRole("alert").textContent).toContain("Sync failed.");
  });
});
