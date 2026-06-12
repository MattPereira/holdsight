"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";

import {
  loadCreditCardAccounts,
  loadDepositoryBalances,
  removeDepository,
} from "@/app/actions";
import { DepositoryManager } from "@/components/depository-manager";
import { Button } from "@/components/ui/button";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function accountLabel(account: DepositoryAccountRow): string {
  const name = account.institutionName ?? account.label ?? "Account";
  return account.accountMask ? `${name} ••${account.accountMask}` : name;
}

function creditCardProvider(account: CreditCardAccountRow): string {
  return account.institutionName ?? account.label ?? "Credit card";
}

function formatDueDate(date: string | null): string {
  if (!date) return "No due date";

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function BankingPage({
  initialAccounts,
  initialCreditCardAccounts,
}: {
  initialAccounts: DepositoryAccountRow[];
  initialCreditCardAccounts: CreditCardAccountRow[];
}) {
  const [accounts, setAccounts] =
    useState<DepositoryAccountRow[]>(initialAccounts);
  const [creditCardAccounts, setCreditCardAccounts] =
    useState<CreditCardAccountRow[]>(initialCreditCardAccounts);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = isPending;
  const hasAccounts = accounts.length > 0 || creditCardAccounts.length > 0;

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const depositoryResult = await loadDepositoryBalances();
      const creditCardResult = await loadCreditCardAccounts();
      setAccounts(depositoryResult.accounts);
      setCreditCardAccounts(creditCardResult.accounts);
      setError(depositoryResult.error ?? creditCardResult.error);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Banking</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={busy}
          aria-label={accounts.length > 0 ? "Refresh Banking" : "Load Banking"}
        >
          <RiRefreshLine />
        </Button>
        <DepositoryManager
          accounts={accounts}
          onRemove={handleRemove}
          disabled={busy}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!hasAccounts ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No bank accounts or credit cards linked yet. Connect an account to
          load balances.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {accounts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="px-1 font-medium">Checking Accounts</h2>
              <ul className="divide-y rounded-lg border">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="truncate">{accountLabel(account)}</span>
                    <span className="tabular-nums">
                      {usdFormat.format(account.currentBalance)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {creditCardAccounts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="px-1 font-medium">Credit Cards</h2>
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
                        Due {formatDueDate(account.nextPaymentDueDate)}
                      </span>
                    </div>
                    <span className="tabular-nums">
                      {usdFormat.format(account.currentBalance)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
