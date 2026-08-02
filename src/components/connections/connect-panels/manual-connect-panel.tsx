"use client";

import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addManualBalanceItem,
  removeManualBalanceItem,
  updateManualBalanceItem,
} from "@/app/(app)/connections/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/format";
import type {
  ManualBalanceItemKind,
  ManualBalanceItemRow,
} from "@/lib/manual-balance/items";

const emptyForm = {
  kind: "asset" as ManualBalanceItemKind,
  name: "",
  symbol: "",
  amount: "",
};

export function ManualConnectPanel({
  initialItems,
  onConnected,
  view = "add",
}: {
  initialItems: ManualBalanceItemRow[];
  onConnected: () => void;
  view?: "add" | "remove";
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    const isEdit = Boolean(editingId);

    startTransition(async () => {
      const result = editingId
        ? await updateManualBalanceItem(editingId, input)
        : await addManualBalanceItem(input);
      setItems(result.items);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      router.refresh();
      // Editing stays open so the saved row is visible; adding closes the sheet
      // to match the other connect flows.
      if (isEdit) resetForm();
      else onConnected();
    });
  }

  function handleRemove(itemId: string) {
    startTransition(async () => {
      const result = await removeManualBalanceItem(itemId);
      setItems(result.items);
      setFormError(result.error);
      // Removal keeps the sheet open so several can be pruned in a row.
      if (!result.error) {
        if (editingId === itemId) resetForm();
        router.refresh();
      }
    });
  }

  const formNode = (
    <form onSubmit={handleSubmit} className="rounded-lg border p-3">
      <FieldGroup>
        <Field>
          <FieldLabel>Type</FieldLabel>

          <div className="flex gap-5">
            {(["asset", "liability"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                size="lg"
                variant={form.kind === kind ? "default" : "outline"}
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
                disabled={isPending}
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
            disabled={isPending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="manual-symbol">Symbol</FieldLabel>
          <Input
            id="manual-symbol"
            value={form.symbol}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, symbol: event.target.value }))
            }
            placeholder="XAU"
            autoComplete="off"
            disabled={isPending}
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
              setForm((prev) => ({ ...prev, amount: event.target.value }))
            }
            placeholder="0.00"
            disabled={isPending}
            aria-invalid={Boolean(formError)}
          />
        </Field>
        {formError ? (
          <p className="text-sm text-destructive">{formError}</p>
        ) : null}
        <div className="flex justify-end items-center gap-2">
          <Button size="lg" type="submit" disabled={isPending}>
            <RiAddLine data-icon="inline-start" />
            {editingId ? "Save" : "Add item"}
          </Button>
          {editingId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetForm}
              disabled={isPending}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );

  if (view === "remove") {
    if (items.length === 0) return null;

    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Custom</h3>
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => startEdit(item)}
                disabled={isPending}
                className="flex min-w-0 flex-1 flex-col items-start text-left"
              >
                <span className="truncate text-sm font-medium">
                  {item.name} {item.symbol}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {item.kind} · {formatUsd(item.amount)}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${item.name}`}
                onClick={() => handleRemove(item.id)}
                disabled={isPending}
              >
                <RiDeleteBinLine />
              </Button>
            </li>
          ))}
        </ul>
        {editingId ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Edit item</h4>
            {formNode}
          </div>
        ) : null}
      </div>
    );
  }

  return formNode;
}
