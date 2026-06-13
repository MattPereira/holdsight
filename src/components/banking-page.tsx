"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";

import {
  loadCreditCardAccounts,
  loadBrokerageBalances,
  loadDepositoryBalances,
  loadKrakenBalances,
  loadOnChainBalances,
  removeCreditCard,
  removeDepository,
  type ManualBalanceActionResult,
} from "@/app/actions";
import { DepositoryManager } from "@/components/depository-manager";
import { Button } from "@/components/ui/button";
import {
  aggregateAssetRows,
  type AggregateAssetRow,
} from "@/lib/balance-sheet/aggregate-assets";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";

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

export function BankingPage({
  initialAccounts,
  initialCreditCardAccounts,
  initialManualItems,
  initialAggregateAssetRows,
}: {
  initialAccounts: DepositoryAccountRow[];
  initialCreditCardAccounts: CreditCardAccountRow[];
  initialManualItems: ManualBalanceItemRow[];
  initialAggregateAssetRows: AggregateAssetRow[];
}) {
  const [accounts, setAccounts] =
    useState<DepositoryAccountRow[]>(initialAccounts);
  const [creditCardAccounts, setCreditCardAccounts] = useState<
    CreditCardAccountRow[]
  >(initialCreditCardAccounts);
  const [manualItems, setManualItems] =
    useState<ManualBalanceItemRow[]>(initialManualItems);
  const [aggregateAssets, setAggregateAssets] = useState<AggregateAssetRow[]>(
    initialAggregateAssetRows,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = isPending;

  const manualAssets = manualItems.filter((item) => item.kind === "asset");
  const manualLiabilities = manualItems.filter(
    (item) => item.kind === "liability",
  );

  const hasAssets =
    accounts.length > 0 ||
    manualAssets.length > 0 ||
    aggregateAssets.length > 0;
  const hasLiabilities =
    creditCardAccounts.length > 0 || manualLiabilities.length > 0;
  const hasAnything = hasAssets || hasLiabilities;

  const checkingTotal = accounts
    .filter((account) => account.kind === "checking")
    .reduce((sum, account) => sum + account.currentBalance, 0);
  const assetTotal =
    accounts.reduce((sum, account) => sum + account.currentBalance, 0) +
    manualAssets.reduce((sum, item) => sum + item.amount, 0) +
    aggregateAssets.reduce((sum, row) => sum + row.valueUsd, 0);
  const liabilityTotal =
    creditCardAccounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ) + manualLiabilities.reduce((sum, item) => sum + item.amount, 0);
  const netCash = checkingTotal - liabilityTotal;
  const netBalance = assetTotal - liabilityTotal;

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const [
        depositoryResult,
        creditCardResult,
        onChainResults,
        exchangeResults,
        brokerageResult,
      ] = await Promise.all([
        loadDepositoryBalances(),
        loadCreditCardAccounts(),
        loadOnChainBalances(),
        loadKrakenBalances(),
        loadBrokerageBalances(),
      ]);
      setAccounts(depositoryResult.accounts);
      setCreditCardAccounts(creditCardResult.accounts);
      setAggregateAssets(
        aggregateAssetRows({
          onChainResults,
          exchangeResults,
          brokerageAccounts: brokerageResult.accounts,
        }),
      );
      setError(
        depositoryResult.error ??
          creditCardResult.error ??
          brokerageResult.error,
      );
    });
  }

  function handleRemove(plaidItemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeDepository(plaidItemId);
      setAccounts(result.accounts);
      setError(result.error);
    });
  }

  function handleRemoveCreditCard(plaidItemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeCreditCard(plaidItemId);
      setCreditCardAccounts(result.accounts);
      setError(result.error);
    });
  }

  function handleManualResult(result: ManualBalanceActionResult) {
    setManualItems(result.items);
    setError(result.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Balance Sheet</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={busy}
          aria-label={
            accounts.length > 0 ? "Refresh Balance Sheet" : "Load Balance Sheet"
          }
        >
          <RiRefreshLine />
        </Button>
        <DepositoryManager
          accounts={accounts}
          creditCardAccounts={creditCardAccounts}
          manualItems={manualItems}
          onRemove={handleRemove}
          onRemoveCreditCard={handleRemoveCreditCard}
          onManualResult={handleManualResult}
          disabled={busy}
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
          {hasAssets ? (
            <div className="flex flex-col gap-2">
              <h2 className="px-1 font-medium">Assets</h2>
              <ul className="divide-y rounded-lg border">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{accountLabel(account)}</span>
                      <span className="text-xs text-muted-foreground">
                        {depositoryType(account)}
                      </span>
                    </div>
                    <span className="tabular-nums">
                      {usdFormat.format(account.currentBalance)}
                    </span>
                  </li>
                ))}
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
                {aggregateAssets.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{row.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.description}
                      </span>
                    </div>
                    <span className="tabular-nums">
                      {usdFormat.format(row.valueUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasLiabilities ? (
            <div className="flex flex-col gap-2">
              <h2 className="px-1 font-medium">Liabilities</h2>
              <ul className="divide-y rounded-lg border">
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
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <ul className="divide-y rounded-lg border bg-muted">
              <li className="flex items-center justify-between gap-3 px-4 py-3 font-medium">
                <div className="flex min-w-0 flex-col">
                  <span>Net Cash</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Checking - Liabilities
                  </span>
                </div>
                <span className="tabular-nums">
                  {usdFormat.format(netCash)}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 px-4 py-3 font-medium">
                <div className="flex min-w-0 flex-col">
                  <span>Net Assets</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Assets - Liabilities
                  </span>
                </div>
                <span className="tabular-nums">
                  {usdFormat.format(netBalance)}
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
