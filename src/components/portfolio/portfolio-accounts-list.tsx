"use client";

import { RiSettings3Line } from "@remixicon/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  CollapsibleLineItem,
  LineItemGroup,
  LineItemRow,
  NestedLineItem,
  NestedLineItems,
} from "@/components/ui/line-item";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import type { InvestmentAccountSection } from "@/lib/portfolio/account-asset-rows";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function accountLabel(account: DepositoryAccountRow): string {
  const name = account.institutionName ?? account.label ?? "Account";
  return account.accountMask ? `${name} ••${account.accountMask}` : name;
}

function depositoryType(account: DepositoryAccountRow): string {
  return account.kind === "savings" ? "Savings Account" : "Checking Account";
}

function creditCardProvider(account: CreditCardAccountRow): string {
  const name = account.institutionName ?? account.label ?? "Credit card";
  return account.accountMask ? `${name} ••${account.accountMask}` : name;
}

function investmentSectionLabel(section: InvestmentAccountSection): string {
  switch (section.id) {
    case "exchange":
      return "Exchanges";
    case "brokerage":
      return "Brokerages";
    default:
      return section.label;
  }
}

export function PortfolioAccountsList({
  accounts,
  creditCardAccounts,
  manualItems,
  investmentAccountSections,
}: {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
  investmentAccountSections: InvestmentAccountSection[];
}) {
  const manualAssets = manualItems.filter((item) => item.kind === "asset");
  const manualLiabilities = manualItems.filter(
    (item) => item.kind === "liability",
  );

  const hasDepository = accounts.length > 0;
  const hasInvestments =
    manualAssets.length > 0 || investmentAccountSections.length > 0;
  const hasAssets = hasDepository || hasInvestments;
  const hasLiabilities =
    creditCardAccounts.length > 0 || manualLiabilities.length > 0;
  const hasCashPosition = hasDepository || hasLiabilities;
  const hasAnything = hasAssets || hasLiabilities;

  const depositoryTotal = accounts.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  );
  const liabilityTotal =
    creditCardAccounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ) + manualLiabilities.reduce((sum, item) => sum + item.amount, 0);
  const bankTotal = depositoryTotal - liabilityTotal;

  const manualAssetsTotal = manualAssets.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const investmentTotal = investmentAccountSections.reduce(
    (sum, section) => sum + section.valueUsd,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {!hasAnything ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No bank accounts or credit cards linked yet. Connect an account or add
          a manual item to track balances.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {hasInvestments ? (
            <section>
              <LineItemGroup type="multiple">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-3 font-medium">
                  <span>Investments</span>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="size-7"
                  >
                    <Link href="/connect" aria-label="Configure accounts">
                      <RiSettings3Line />
                    </Link>
                  </Button>
                </div>
                {investmentAccountSections.map((section) => (
                  <CollapsibleLineItem
                    key={section.id}
                    id={section.id}
                    label={investmentSectionLabel(section)}
                    labelClassName="font-normal"
                    value={usdFormat.format(section.valueUsd)}
                    valueClassName="font-normal"
                  >
                    <NestedLineItems>
                      {section.children.map((child) => (
                        <NestedLineItem
                          key={child.id}
                          label={child.label}
                          labelTitle={child.label}
                          sublabel={child.description}
                          sublabelTitle={child.description}
                          value={usdFormat.format(child.valueUsd)}
                        />
                      ))}
                    </NestedLineItems>
                  </CollapsibleLineItem>
                ))}
                {manualAssets.map((item) => (
                  <LineItemRow
                    key={item.id}
                    label={item.symbol}
                    labelClassName="font-normal"
                    labelTitle={item.symbol}
                    value={usdFormat.format(item.amount)}
                    valueClassName="font-normal"
                  />
                ))}
                <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-3 font-medium">
                  <span className="">Total Funds</span>
                  <span className="tabular-nums">
                    {usdFormat.format(investmentTotal + manualAssetsTotal)}
                  </span>
                </div>
              </LineItemGroup>
            </section>
          ) : null}

          {hasCashPosition ? (
            <section>
              <LineItemGroup type="multiple">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-3 font-medium">
                  <span>Banks</span>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="size-7"
                  >
                    <Link href="/connect" aria-label="Configure accounts">
                      <RiSettings3Line />
                    </Link>
                  </Button>
                </div>
                {hasDepository ? (
                  <CollapsibleLineItem
                    id="deposits"
                    label="Deposits"
                    labelClassName="font-normal"
                    value={usdFormat.format(depositoryTotal)}
                    valueClassName="font-normal"
                  >
                    <NestedLineItems>
                      {accounts.map((account) => (
                        <NestedLineItem
                          key={account.id}
                          label={accountLabel(account)}
                          labelTitle={accountLabel(account)}
                          sublabel={depositoryType(account)}
                          value={usdFormat.format(account.currentBalance)}
                        />
                      ))}
                    </NestedLineItems>
                  </CollapsibleLineItem>
                ) : null}
                {hasLiabilities ? (
                  <CollapsibleLineItem
                    id="liabilities"
                    label="Liabilities"
                    labelClassName="font-normal"
                    value={usdFormat.format(liabilityTotal)}
                    valueClassName="font-normal text-red-600 dark:text-red-400"
                  >
                    <NestedLineItems>
                      {creditCardAccounts.map((account) => (
                        <NestedLineItem
                          key={account.id}
                          label={creditCardProvider(account)}
                          labelTitle={creditCardProvider(account)}
                          sublabel="Credit Card"
                          value={usdFormat.format(account.currentBalance)}
                          valueClassName="text-red-600/90 dark:text-red-400/60"
                        />
                      ))}
                      {manualLiabilities.map((item) => (
                        <NestedLineItem
                          key={item.id}
                          label={item.symbol}
                          labelTitle={item.symbol}
                          sublabel={item.name}
                          value={usdFormat.format(item.amount)}
                          valueClassName="text-red-600/90 dark:text-red-400/60"
                        />
                      ))}
                    </NestedLineItems>
                  </CollapsibleLineItem>
                ) : null}
                <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-3 font-medium">
                  <span className="">Checking Net</span>
                  <span className="tabular-nums">
                    {usdFormat.format(bankTotal)}
                  </span>
                </div>
              </LineItemGroup>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
