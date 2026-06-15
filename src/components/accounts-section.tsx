"use client";

import { useTransition } from "react";

import {
  removeCreditCard,
  removeDepository,
  type ManualBalanceActionResult,
} from "@/app/actions";
import { DepositoryManager } from "@/components/depository-manager";
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

export function AccountsSection({
  accounts,
  creditCardAccounts,
  manualItems,
  investmentAccountSections,
  error,
  busy = false,
  onAccountsChange,
  onCreditCardAccountsChange,
  onManualItemsChange,
  onError,
}: {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
  investmentAccountSections: InvestmentAccountSection[];
  error: string | null;
  busy?: boolean;
  onAccountsChange: (accounts: DepositoryAccountRow[]) => void;
  onCreditCardAccountsChange: (accounts: CreditCardAccountRow[]) => void;
  onManualItemsChange: (items: ManualBalanceItemRow[]) => void;
  onError: (error: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const disabled = busy || isPending;

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

  const checkingTotal = accounts
    .filter((account) => account.kind === "checking")
    .reduce((sum, account) => sum + account.currentBalance, 0);
  const liabilityTotal =
    creditCardAccounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ) + manualLiabilities.reduce((sum, item) => sum + item.amount, 0);
  const netCash = checkingTotal - liabilityTotal;

  function handleRemove(plaidItemId: string) {
    onError(null);
    startTransition(async () => {
      const result = await removeDepository(plaidItemId);
      onAccountsChange(result.accounts);
      onError(result.error);
    });
  }

  function handleRemoveCreditCard(plaidItemId: string) {
    onError(null);
    startTransition(async () => {
      const result = await removeCreditCard(plaidItemId);
      onCreditCardAccountsChange(result.accounts);
      onError(result.error);
    });
  }

  function handleManualResult(result: ManualBalanceActionResult) {
    onManualItemsChange(result.items);
    onError(result.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <DepositoryManager
          accounts={accounts}
          creditCardAccounts={creditCardAccounts}
          manualItems={manualItems}
          onRemove={handleRemove}
          onRemoveCreditCard={handleRemoveCreditCard}
          onManualResult={handleManualResult}
          disabled={disabled}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!hasAnything ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No bank accounts or credit cards linked yet. Connect an account or add
          a manual item to track balances.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {hasInvestments ? (
            <div className="flex flex-col gap-5">
              {manualAssets.length > 0 ? (
                <section>
                  <h2 className="px-2 font-medium mb-3">Manual Assets</h2>
                  <ul className="divide-y border rounded-lg">
                    {manualAssets.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{item.symbol}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.name}
                          </span>
                        </div>
                        <span className="tabular-nums">
                          {usdFormat.format(item.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {investmentAccountSections.map((row) => (
                <section key={row.id}>
                  <h2 className="px-2 font-medium mb-3">{row.label}</h2>
                  <ul className="divide-y border rounded-lg">
                    {row.children.map((child) => (
                      <li
                        key={child.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{child.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {child.description}
                          </span>
                        </div>
                        <span className="tabular-nums">
                          {usdFormat.format(child.valueUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {hasCashPosition ? (
              <div className="overflow-hidden rounded-lg flex flex-col gap-5">
                {hasDepository ? (
                  <section>
                    <h2 className="px-2 font-medium mb-3">Depository</h2>
                    <ul className="divide-y border rounded-lg">
                      {accounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {accountLabel(account)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {depositoryType(account)}
                            </span>
                          </div>
                          <span className="tabular-nums">
                            {usdFormat.format(account.currentBalance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {hasLiabilities ? (
                  <section>
                    <h2 className="px-2 font-medium mb-3">Liabilities</h2>
                    <ul className="divide-y border rounded-lg">
                      {creditCardAccounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {creditCardProvider(account)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Credit Card
                            </span>
                          </div>
                          <span className="tabular-nums text-red-600 dark:text-red-400">
                            {usdFormat.format(account.currentBalance)}
                          </span>
                        </li>
                      ))}
                      {manualLiabilities.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">{item.symbol}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.name}
                            </span>
                          </div>
                          <span className="tabular-nums text-red-600 dark:text-red-400">
                            {usdFormat.format(item.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <div className="border rounded-lg bg-muted">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 font-medium">
                    <div className="flex min-w-0 flex-col">
                      <span>Liquid Cash</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Checking - Liabilities
                      </span>
                    </div>
                    <span className="tabular-nums">
                      {usdFormat.format(netCash)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
