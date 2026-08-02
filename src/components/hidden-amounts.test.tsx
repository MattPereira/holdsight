import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BalancesTable } from "@/components/accounts/balances/balances-table";
import {
  BROKERAGE_SECONDARY_COLUMN,
  WALLET_SECONDARY_COLUMN,
} from "@/components/accounts/balances/groups";
import { TransactionsTable } from "@/components/accounts/transactions/transactions-table";
import { PortfolioAccountsList } from "@/components/portfolio/portfolio-accounts-list";
import type { BalanceGroup } from "@/components/accounts/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type { InvestmentAccountSection } from "@/lib/portfolio/account-asset-rows";

/**
 * Coverage for the marking that Hidden Amounts depends on.
 *
 * The blur itself is a single CSS rule and is not asserted here — jsdom does no
 * visual rendering, so a test could only restate the implementation. What is
 * worth catching is a *new* figure being rendered without `data-sensitive`,
 * which fails silently and is only discovered by leaking a screenshot.
 */

function masked(container: HTMLElement, text: string): boolean {
  return Array.from(container.querySelectorAll("[data-sensitive]")).some(
    (node) => (node.textContent ?? "").includes(text),
  );
}

function rendersText(container: HTMLElement, text: string): boolean {
  return (container.textContent ?? "").includes(text);
}

afterEach(() => {
  cleanup();
});

describe("PortfolioAccountsList", () => {
  const section: InvestmentAccountSection = {
    id: "wallets",
    label: "Wallets",
    description: "Wallet assets",
    valueUsd: 1250.5,
    children: [
      { id: "w1", label: "0xabc", description: "Evm wallet", valueUsd: 900.25 },
    ],
  };

  it("masks every account value and group total", () => {
    const { container } = render(
      <PortfolioAccountsList
        accounts={[]}
        creditCardAccounts={[]}
        manualItems={[]}
        investmentAccountSections={[section]}
      />,
    );

    expect(masked(container, "$1,250.50")).toBe(true);
    expect(masked(container, "$900.25")).toBe(true);
  });
});

describe("BalancesTable", () => {
  const group: BalanceGroup = {
    key: "g1",
    title: "0xabc…1234",
    rows: [
      {
        key: "r1",
        symbol: "ETH",
        secondary: "ethereum",
        amount: 12.4021,
        priceUsd: 3210.55,
        valueUsd: 39812.44,
      },
    ],
    total: 39812.44,
  };

  it("masks quantities and USD values but not prices", () => {
    const { container } = render(
      <BalancesTable group={group} secondaryColumn={WALLET_SECONDARY_COLUMN} />,
    );

    expect(masked(container, "12.4021")).toBe(true);
    expect(masked(container, "$39,812.44")).toBe(true);

    // A price is public market data. Blurring it would cost a shared
    // screenshot its usefulness without protecting anything.
    expect(rendersText(container, "$3,210.55")).toBe(true);
    expect(masked(container, "$3,210.55")).toBe(false);
  });

  it("leaves a chain name legible", () => {
    const { container } = render(
      <BalancesTable group={group} secondaryColumn={WALLET_SECONDARY_COLUMN} />,
    );

    expect(rendersText(container, "ethereum")).toBe(true);
    expect(masked(container, "ethereum")).toBe(false);
  });

  it("masks the secondary column when it holds cost basis", () => {
    const brokerageGroup: BalanceGroup = {
      ...group,
      rows: [{ ...group.rows[0], secondary: "$30,000.00" }],
    };

    const { container } = render(
      <BalancesTable
        group={brokerageGroup}
        secondaryColumn={BROKERAGE_SECONDARY_COLUMN}
      />,
    );

    expect(masked(container, "$30,000.00")).toBe(true);
  });
});

describe("TransactionsTable", () => {
  const trade: InvestmentTransactionListItem = {
    id: "t1",
    investmentAccountId: "a1",
    accountLabel: "Kraken",
    sourceTransactionId: "s1",
    sourceAccountId: null,
    executedAt: new Date("2026-01-15T12:00:00Z").toISOString(),
    settledAt: null,
    kind: "trade",
    side: "buy",
    baseAssetSymbol: "BTC",
    baseAssetId: null,
    baseAmount: 0.25,
    quoteAssetSymbol: null,
    quoteAmount: null,
    priceQuote: null,
    valueUsd: 16801.03,
    feeAmount: null,
    feeAssetSymbol: null,
    status: "confirmed",
  };

  it("masks both legs of a trade", () => {
    const { container } = render(
      <TransactionsTable
        transactions={[trade]}
        onEditJournal={() => {}}
        timeZone="UTC"
      />,
    );

    expect(masked(container, "0.25 BTC")).toBe(true);
    expect(masked(container, "$16,801.03")).toBe(true);
  });

  it("masks the perp detail line", () => {
    const perp: InvestmentTransactionListItem = {
      ...trade,
      displayType: "perp_event",
      perpEventType: "close",
      perpPositionSide: "long",
      side: "close",
      entryPrice: 60000,
      exitPrice: 64000,
      grossPnlUsd: 1000,
      netPnlUsd: 950.75,
    };

    const { container } = render(
      <TransactionsTable
        transactions={[perp]}
        onEditJournal={() => {}}
        timeZone="UTC"
      />,
    );

    expect(masked(container, "+$950.75")).toBe(true);
    // The detail line joins position size, prices and PnL into one string, so
    // it is masked whole — over-blurring the prices is the safe direction.
    expect(masked(container, "gross +$1,000.00")).toBe(true);
  });
});
