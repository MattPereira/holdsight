"use client";

import { RiArrowRightSLine } from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import type { InvestmentAccountSection } from "@/lib/portfolio/account-asset-rows";
import { cn } from "@/lib/utils";

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

const LIABILITY_TOTAL_CLASS = "text-red-600 dark:text-red-400";
const LIABILITY_ROW_CLASS = "text-red-600/90 dark:text-red-400/60";

// Which investment sections have a dedicated detail page, and how they're
// labelled on this list. Sections without an entry render without a link.
const INVESTMENT_SECTION_LINKS: Record<
  string,
  { label: string; href: string }
> = {
  wallets: { label: "Wallets", href: "/wallets" },
  exchange: { label: "Exchanges", href: "/exchanges" },
  brokerage: { label: "Brokerages", href: "/brokerages" },
};

/** One account group as a standalone card: a subheader band (optionally linking
 *  to a detail page) with its member accounts listed as divided rows beneath. */
function AccountCard({
  label,
  href,
  value,
  valueClassName,
  children,
}: {
  label: string;
  href?: string;
  value: number;
  valueClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-4 border-b bg-muted/40 px-4 py-2.5">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        {href ? (
          <Link
            href={href}
            aria-label={`View ${label}`}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            View
            <RiArrowRightSLine className="size-3.5" />
          </Link>
        ) : null}
      </div>
      <div className="divide-y">{children}</div>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5">
        <span className="text-sm font-medium text-muted-foreground">Total</span>
        <span
          className={cn("text-sm font-semibold tabular-nums", valueClassName)}
        >
          {usdFormat.format(value)}
        </span>
      </div>
    </section>
  );
}

/** A single account line within an <AccountCard>. */
function AccountRow({
  label,
  sublabel,
  value,
  valueClassName,
}: {
  label: string;
  sublabel?: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="min-w-0 truncate text-sm" title={label}>
          {label}
        </span>
        {sublabel ? (
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={sublabel}
          >
            {sublabel}
          </span>
        ) : null}
      </div>
      <span className={cn("text-sm tabular-nums", valueClassName)}>
        {usdFormat.format(value)}
      </span>
    </div>
  );
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

  const investmentCards = investmentAccountSections.filter(
    (section) => section.children.length > 0,
  );
  const hasDepository = accounts.length > 0;
  const hasLiabilities =
    creditCardAccounts.length > 0 || manualLiabilities.length > 0;
  const hasManualAssets = manualAssets.length > 0;
  const hasAnything =
    investmentCards.length > 0 ||
    hasManualAssets ||
    hasDepository ||
    hasLiabilities;

  const depositoryTotal = accounts.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  );
  const liabilityTotal =
    creditCardAccounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ) + manualLiabilities.reduce((sum, item) => sum + item.amount, 0);
  const manualAssetsTotal = manualAssets.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  if (!hasAnything) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        No bank accounts or credit cards linked yet. Connect an account or add a
        manual item to track balances.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {investmentCards.map((section) => {
        const link = INVESTMENT_SECTION_LINKS[section.id];
        return (
          <AccountCard
            key={section.id}
            label={link?.label ?? section.label}
            href={link?.href}
            value={section.valueUsd}
          >
            {section.children.map((child) => (
              <AccountRow
                key={child.id}
                label={child.label}
                sublabel={child.description}
                value={child.valueUsd}
              />
            ))}
          </AccountCard>
        );
      })}

      {hasManualAssets ? (
        <AccountCard label="Manual" value={manualAssetsTotal}>
          {manualAssets.map((item) => (
            <AccountRow
              key={item.id}
              label={item.symbol}
              sublabel={item.name}
              value={item.amount}
            />
          ))}
        </AccountCard>
      ) : null}

      {hasDepository ? (
        <AccountCard label="Deposits" value={depositoryTotal}>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              label={accountLabel(account)}
              sublabel={depositoryType(account)}
              value={account.currentBalance}
            />
          ))}
        </AccountCard>
      ) : null}

      {hasLiabilities ? (
        <AccountCard
          label="Liabilities"
          value={liabilityTotal}
          valueClassName={LIABILITY_TOTAL_CLASS}
        >
          {creditCardAccounts.map((account) => (
            <AccountRow
              key={account.id}
              label={creditCardProvider(account)}
              sublabel="Credit Card"
              value={account.currentBalance}
              valueClassName={LIABILITY_ROW_CLASS}
            />
          ))}
          {manualLiabilities.map((item) => (
            <AccountRow
              key={item.id}
              label={item.symbol}
              sublabel={item.name}
              value={item.amount}
              valueClassName={LIABILITY_ROW_CLASS}
            />
          ))}
        </AccountCard>
      ) : null}
    </div>
  );
}
