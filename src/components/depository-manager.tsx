"use client";

import { RiDeleteBinLine, RiSettings3Line } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";

export function DepositoryManager({
  accounts,
  creditCardAccounts,
  onRemove,
  onRemoveCreditCard,
  disabled,
}: {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  onRemove: (plaidItemId: string) => void;
  onRemoveCreditCard: (plaidItemId: string) => void;
  disabled: boolean;
}) {
  const hasAnything = accounts.length > 0 || creditCardAccounts.length > 0;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Manage accounts">
          <RiSettings3Line />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Bank Accounts</SheetTitle>
          <SheetDescription>
            Remove a linked banking account.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {accounts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Checking Accounts</h3>
              <ul className="divide-y rounded-lg border">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {account.institutionName ?? account.label ?? "Account"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {account.accountMask ? `••${account.accountMask}` : ""}
                        {account.kind === "savings" ? " · Savings" : ""}
                      </span>
                    </div>
                    {account.plaidItemId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${account.label ?? "account"}`}
                        onClick={() => onRemove(account.plaidItemId!)}
                        disabled={disabled}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {creditCardAccounts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Credit Cards</h3>
              <ul className="divide-y rounded-lg border">
                {creditCardAccounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {account.institutionName ?? account.label ?? "Credit card"}
                      </span>
                      {account.accountMask ? (
                        <span className="text-xs text-muted-foreground">
                          ••{account.accountMask}
                        </span>
                      ) : null}
                    </div>
                    {account.plaidItemId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${account.institutionName ?? account.label ?? "credit card"}`}
                        onClick={() => onRemoveCreditCard(account.plaidItemId!)}
                        disabled={disabled}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!hasAnything ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No bank accounts linked yet.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
