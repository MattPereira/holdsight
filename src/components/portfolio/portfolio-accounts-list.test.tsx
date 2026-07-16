import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PortfolioAccountsList } from "./portfolio-accounts-list";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import type { InvestmentAccountSection } from "@/lib/portfolio/account-asset-rows";

const walletSection: InvestmentAccountSection = {
  id: "wallets",
  label: "Wallets",
  description: "Wallet assets",
  valueUsd: 100,
  children: [
    { id: "w1", label: "0xabc", description: "Evm wallet", valueUsd: 60 },
    { id: "w2", label: "0xdef", description: "Evm wallet", valueUsd: 40 },
  ],
};

const exchangeSection: InvestmentAccountSection = {
  id: "exchange",
  label: "Exchange",
  description: "Exchange assets",
  valueUsd: 25,
  children: [
    { id: "e1", label: "kraken", description: "Centralized exchange", valueUsd: 25 },
  ],
};

const brokerageSection: InvestmentAccountSection = {
  id: "brokerage",
  label: "Brokerage",
  description: "Brokerage assets",
  valueUsd: 50,
  children: [
    { id: "b1", label: "Fidelity", description: "Brokerage", valueUsd: 50 },
  ],
};

const depositoryAccount: DepositoryAccountRow = {
  id: "d1",
  plaidItemId: null,
  externalAccountId: null,
  kind: "checking",
  label: "Everyday",
  institutionName: "Big Bank",
  accountMask: "1234",
  currency: "USD",
  currentBalance: 500,
  status: "active",
};

const creditCardAccount: CreditCardAccountRow = {
  id: "c1",
  plaidItemId: null,
  externalAccountId: null,
  label: "Rewards Card",
  institutionName: "Card Co",
  accountMask: "9999",
  currency: "USD",
  currentBalance: 200,
  availableCredit: null,
  creditLimit: null,
  minimumPaymentAmount: null,
  nextPaymentDueDate: null,
  lastPaymentAmount: null,
  lastPaymentDate: null,
  lastStatementIssueDate: null,
} as CreditCardAccountRow;

const manualAsset: ManualBalanceItemRow = {
  id: "m1",
  kind: "asset",
  symbol: "GOLD",
  name: "Gold bar",
  currency: "USD",
  amount: 75,
};

const manualLiability: ManualBalanceItemRow = {
  id: "m2",
  kind: "liability",
  symbol: "LOAN",
  name: "Car loan",
  currency: "USD",
  amount: 300,
};

function renderFull() {
  return render(
    <PortfolioAccountsList
      accounts={[depositoryAccount]}
      creditCardAccounts={[creditCardAccount]}
      manualItems={[manualAsset, manualLiability]}
      investmentAccountSections={[
        walletSection,
        exchangeSection,
        brokerageSection,
      ]}
    />,
  );
}

describe("PortfolioAccountsList", () => {
  afterEach(() => {
    cleanup();
  });

  it("links the investment subheaders to their detail pages", () => {
    renderFull();

    expect(
      screen.getByRole("link", { name: /wallets/i }).getAttribute("href"),
    ).toBe("/wallets");
    expect(
      screen.getByRole("link", { name: /exchanges/i }).getAttribute("href"),
    ).toBe("/exchanges");
    expect(
      screen.getByRole("link", { name: /brokerages/i }).getAttribute("href"),
    ).toBe("/brokerages");
  });

  it("shows every child account inline without any expand interaction", () => {
    renderFull();

    // Investment children
    expect(screen.getByText("0xabc")).toBeTruthy();
    expect(screen.getByText("0xdef")).toBeTruthy();
    expect(screen.getByText("kraken")).toBeTruthy();
    expect(screen.getByText("Fidelity")).toBeTruthy();
    // Bank children (deposit + credit card + manual liability)
    expect(screen.getByText(/Big Bank/)).toBeTruthy();
    expect(screen.getByText(/Card Co/)).toBeTruthy();
    expect(screen.getByText("LOAN")).toBeTruthy();
    // Manual asset
    expect(screen.getByText("GOLD")).toBeTruthy();
  });

  it("does not render the Investments or Banks group headers", () => {
    renderFull();

    expect(screen.queryByText("Investments")).toBeNull();
    expect(screen.queryByText("Banks")).toBeNull();
  });

  it("does not render any accordion trigger buttons", () => {
    renderFull();

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders manual assets under a subheader that is not a link", () => {
    renderFull();

    const manualHeader = screen.getByText("Manual");
    expect(manualHeader).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Manual" })).toBeNull();
  });

  it("has no Total Value or Net Value footer", () => {
    renderFull();

    expect(screen.queryByText("Total Value")).toBeNull();
    expect(screen.queryByText("Net Value")).toBeNull();
  });

  it("renders each populated section as its own card", () => {
    const { container } = renderFull();

    // Wallets, Exchanges, Brokerages, Manual, Deposits, Liabilities.
    expect(container.querySelectorAll("section")).toHaveLength(6);
  });

  it("gives every card its own Total row", () => {
    renderFull();

    // One Total row per populated card.
    expect(screen.getAllByText("Total")).toHaveLength(6);
  });

  it("hides groups that have no accounts", () => {
    render(
      <PortfolioAccountsList
        accounts={[]}
        creditCardAccounts={[]}
        manualItems={[]}
        investmentAccountSections={[walletSection]}
      />,
    );

    expect(screen.getByText("Wallets")).toBeTruthy();
    expect(screen.queryByText("Exchanges")).toBeNull();
    expect(screen.queryByText("Brokerages")).toBeNull();
    expect(screen.queryByText("Deposits")).toBeNull();
    expect(screen.queryByText("Liabilities")).toBeNull();
    expect(screen.queryByText("Manual")).toBeNull();
    // No bank card at all → no Net Value footer.
    expect(screen.queryByText("Net Value")).toBeNull();
  });

  it("shows an empty state when nothing is linked", () => {
    render(
      <PortfolioAccountsList
        accounts={[]}
        creditCardAccounts={[]}
        manualItems={[]}
        investmentAccountSections={[]}
      />,
    );

    expect(screen.getByText(/No bank accounts or credit cards linked/i)).toBeTruthy();
  });

  it("scopes each investment section's children beneath its own subheader", () => {
    renderFull();

    const walletsLink = screen.getByRole("link", { name: /wallets/i });
    const walletsSection = walletsLink.closest("section");
    expect(walletsSection).not.toBeNull();
    expect(within(walletsSection as HTMLElement).getByText("0xabc")).toBeTruthy();
    expect(within(walletsSection as HTMLElement).queryByText("kraken")).toBeNull();
  });
});
