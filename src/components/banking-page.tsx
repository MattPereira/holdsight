"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";

import { loadDepositoryBalances, removeDepository } from "@/app/actions";
import { DepositoryManager } from "@/components/depository-manager";
import { Button } from "@/components/ui/button";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function accountLabel(account: DepositoryAccountRow): string {
  const name = account.institutionName ?? account.label ?? "Account";
  return account.accountMask ? `${name} ••${account.accountMask}` : name;
}

export function BankingPage({
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

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No bank account linked yet. Connect an account to load balances.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="px-1 font-medium ">Checking Accounts</h2>
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
      )}
    </div>
  );
}
