"use client";

import { RiAddLine, RiDeleteBinLine, RiSettings3Line } from "@remixicon/react";
import { useMemo, useTransition } from "react";

import {
  createBrokerageLinkToken,
  linkBrokerageAccount,
  removeBrokerage,
} from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { usePlaidConnect } from "@/components/use-plaid-connect";
import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type Institution = {
  plaidItemId: string;
  name: string;
  accountCount: number;
  totalValue: number;
};

// Brokerage accounts are linked per Plaid Item (one institution connection can
// back several accounts). Group them so each row removes the whole Item.
function groupByInstitution(
  accounts: CurrentBrokerageAccount[],
): Institution[] {
  const byItem = new Map<string, Institution>();
  for (const account of accounts) {
    if (!account.plaidItemId) continue;
    const existing = byItem.get(account.plaidItemId);
    const value = account.balances.reduce((sum, b) => sum + b.valueUsd, 0);
    if (existing) {
      existing.accountCount += 1;
      existing.totalValue += value;
    } else {
      byItem.set(account.plaidItemId, {
        plaidItemId: account.plaidItemId,
        name: account.institutionName ?? account.brokerage,
        accountCount: 1,
        totalValue: value,
      });
    }
  }
  return [...byItem.values()];
}

export function BrokerageManager({
  accounts,
  onAccountsChange,
  onError,
}: {
  accounts: CurrentBrokerageAccount[];
  onAccountsChange: (accounts: CurrentBrokerageAccount[]) => void;
  onError: (error: string | null) => void;
}) {
  const [isRemoving, startRemove] = useTransition();

  const brokerageConnect = usePlaidConnect({
    purpose: "brokerage",
    returnTo: "/brokerage",
    createLinkToken: createBrokerageLinkToken,
    linkAccount: linkBrokerageAccount,
    onLinked: (result) => onAccountsChange(result.accounts),
    onError,
  });

  const institutions = useMemo(
    () => groupByInstitution(accounts),
    [accounts],
  );

  const busy = isRemoving || brokerageConnect.isConnecting;

  function handleRemove(plaidItemId: string) {
    onError(null);
    startRemove(async () => {
      const result = await removeBrokerage(plaidItemId);
      onAccountsChange(result.accounts);
      onError(result.error);
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Manage brokerage accounts"
        >
          <RiSettings3Line />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Brokerage Accounts</SheetTitle>
          <SheetDescription>
            Connect a brokerage or disconnect a linked institution.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <Button
            type="button"
            onClick={() => brokerageConnect.connect()}
            disabled={busy}
          >
            <RiAddLine data-icon="inline-start" />
            {brokerageConnect.isConnecting
              ? "Connecting..."
              : "Connect brokerage"}
          </Button>

          {institutions.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {institutions.map((institution) => (
                <li
                  key={institution.plaidItemId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {institution.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {institution.accountCount}{" "}
                      {institution.accountCount === 1 ? "account" : "accounts"} ·{" "}
                      {usdFormat.format(institution.totalValue)}
                    </span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Disconnect ${institution.name}`}
                        disabled={busy}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Disconnect {institution.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes{" "}
                          {institution.accountCount === 1
                            ? "1 account"
                            : `all ${institution.accountCount} accounts`}{" "}
                          and their balances, and revokes access at Plaid. You
                          can reconnect later, but this can&apos;t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(institution.plaidItemId)}
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No brokerage linked yet.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
