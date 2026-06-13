"use client";

import { RiAddLine, RiDeleteBinLine, RiSettings3Line } from "@remixicon/react";
import { useState, useTransition } from "react";

import {
  addManualBalanceItem,
  removeManualBalanceItem,
  updateManualBalanceItem,
  type ManualBalanceActionResult,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import type {
  ManualBalanceItemKind,
  ManualBalanceItemRow,
} from "@/lib/manual-balance/items";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const emptyForm = {
  kind: "asset" as ManualBalanceItemKind,
  name: "",
  symbol: "",
  amount: "",
};

export function DepositoryManager({
  accounts,
  creditCardAccounts,
  manualItems,
  onRemove,
  onRemoveCreditCard,
  onManualResult,
  disabled,
}: {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
  onRemove: (plaidItemId: string) => void;
  onRemoveCreditCard: (plaidItemId: string) => void;
  onManualResult: (result: ManualBalanceActionResult) => void;
  disabled: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = disabled || isPending;
  const hasAnything =
    accounts.length > 0 ||
    creditCardAccounts.length > 0 ||
    manualItems.length > 0;

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function startEdit(item: ManualBalanceItemRow) {
    setEditingId(item.id);
    setForm({
      kind: item.kind,
      name: item.name,
      symbol: item.symbol,
      amount: String(item.amount),
    });
    setFormError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const amount = Number(form.amount);
    if (!Number.isFinite(amount)) {
      setFormError("Enter a valid amount.");
      return;
    }

    const input = {
      kind: form.kind,
      name: form.name,
      symbol: form.symbol,
      amount,
    };

    startTransition(async () => {
      const result = editingId
        ? await updateManualBalanceItem(editingId, input)
        : await addManualBalanceItem(input);
      onManualResult(result);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      resetForm();
    });
  }

  function handleRemoveManual(itemId: string) {
    startTransition(async () => {
      const result = await removeManualBalanceItem(itemId);
      onManualResult(result);
      if (editingId === itemId) resetForm();
    });
  }

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
            Remove a linked account or manage manual items.
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
                        disabled={busy}
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
                        disabled={busy}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Manual Items</h3>
            <form
              onSubmit={handleSubmit}
              className="rounded-lg border p-3"
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <div className="flex gap-2">
                    {(["asset", "liability"] as const).map((kind) => (
                      <Button
                        key={kind}
                        type="button"
                        size="sm"
                        variant={form.kind === kind ? "default" : "outline"}
                        onClick={() => setForm((prev) => ({ ...prev, kind }))}
                        disabled={busy}
                        className="flex-1 capitalize"
                      >
                        {kind}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="manual-name">Name</FieldLabel>
                  <Input
                    id="manual-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Gold Bar"
                    disabled={busy}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="manual-symbol">Symbol</FieldLabel>
                  <Input
                    id="manual-symbol"
                    value={form.symbol}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        symbol: event.target.value,
                      }))
                    }
                    placeholder="XAU"
                    autoComplete="off"
                    disabled={busy}
                  />
                </Field>
                <Field data-invalid={Boolean(formError)}>
                  <FieldLabel htmlFor="manual-amount">Amount (USD)</FieldLabel>
                  <Input
                    id="manual-amount"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    disabled={busy}
                    aria-invalid={Boolean(formError)}
                  />
                </Field>
                {formError ? (
                  <p className="text-sm text-destructive">{formError}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={busy}>
                    <RiAddLine data-icon="inline-start" />
                    {editingId ? "Save" : "Add item"}
                  </Button>
                  {editingId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={resetForm}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </FieldGroup>
            </form>

            {manualItems.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {manualItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      disabled={busy}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="truncate text-sm font-medium">
                        {item.name} {item.symbol}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {item.kind} · {usdFormat.format(item.amount)}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => handleRemoveManual(item.id)}
                      disabled={busy}
                    >
                      <RiDeleteBinLine />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

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
