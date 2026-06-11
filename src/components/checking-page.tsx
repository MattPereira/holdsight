"use client";

import { RiDeleteBinLine, RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";

import {
  loadDepositoryBalances,
  removeDepository,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function accountTotal(accounts: DepositoryAccountRow[]): number {
  return accounts.reduce((sum, account) => sum + account.currentBalance, 0);
}

export function CheckingPage({
  initialAccounts,
}: {
  initialAccounts: DepositoryAccountRow[];
}) {
  const [accounts, setAccounts] =
    useState<DepositoryAccountRow[]>(initialAccounts);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = isPending;

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await loadDepositoryBalances();
      setAccounts(result.accounts);
      setError(result.error);
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
        <h1 className="text-xl font-semibold">Checking</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={busy}
          aria-label={accounts.length > 0 ? "Refresh Checking" : "Load Checking"}
        >
          <RiRefreshLine />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No checking account linked yet. Connect an account to load balances.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4 px-2">
            <span className="text-sm font-medium text-muted-foreground">
              Total
            </span>
            <span className="text-sm font-medium tabular-nums">
              {usdFormat.format(accountTotal(accounts))}
            </span>
          </div>
          <ul className="divide-y rounded-lg border">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {account.label ?? account.institutionName ?? "Account"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {account.institutionName}
                    {account.accountMask ? ` ••${account.accountMask}` : ""}
                    {account.kind === "savings" ? " · Savings" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {usdFormat.format(account.currentBalance)}
                  </span>
                  {account.plaidItemId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${account.label ?? "account"}`}
                      onClick={() => handleRemove(account.plaidItemId!)}
                      disabled={busy}
                    >
                      <RiDeleteBinLine />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
