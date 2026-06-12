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
import type { DepositoryAccountRow } from "@/lib/depository/accounts";

export function DepositoryManager({
  accounts,
  onRemove,
  disabled,
}: {
  accounts: DepositoryAccountRow[];
  onRemove: (plaidItemId: string) => void;
  disabled: boolean;
}) {
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
            <ul className="divide-y rounded-lg border">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {account.label ?? account.institutionName ?? "Account"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {account.institutionName}
                      {account.accountMask ? ` ••${account.accountMask}` : ""}
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
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No bank accounts linked yet.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
