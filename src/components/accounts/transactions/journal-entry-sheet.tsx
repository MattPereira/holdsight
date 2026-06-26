"use client";

import { useEffect, useState, useTransition } from "react";

import { RiDeleteBinLine, RiLoader4Line } from "@remixicon/react";
import { toast } from "sonner";

import {
  getTransactionJournalEntry,
  removeTransactionJournalEntry,
  saveTransactionJournalEntry,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type {
  TradeJournalEmotion,
  TradeJournalReason,
} from "@/lib/investment-transactions/journal";
import {
  TRADE_JOURNAL_EMOTION_OPTIONS,
  TRADE_JOURNAL_REASON_OPTIONS,
} from "@/lib/investment-transactions/journal-labels";
import { cn } from "@/lib/utils";

// Radix Select can't hold an empty string value, so an explicit sentinel maps
// to "no selection" for the nullable reason and confidence fields.
const NONE_VALUE = "__none__";
const CONFIDENCE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type FormState = {
  note: string;
  tradeReason: TradeJournalReason | null;
  emotions: TradeJournalEmotion[];
  confidence: number | null;
};

const EMPTY_FORM: FormState = {
  note: "",
  tradeReason: null,
  emotions: [],
  confidence: null,
};

function transactionLabel(
  transaction: InvestmentTransactionListItem,
): string {
  const asset = transaction.baseAssetSymbol;
  const when = dateTimeFormat.format(new Date(transaction.executedAt));
  const side = transaction.side
    ? transaction.side.charAt(0).toUpperCase() + transaction.side.slice(1)
    : null;
  return [side, asset, "·", when].filter(Boolean).join(" ");
}

export function JournalEntrySheet({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: InvestmentTransactionListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hasEntry, setHasEntry] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();

  const transactionId = transaction?.id ?? null;
  const activeId = open ? transactionId : null;

  // Reset the form during render whenever the sheet targets a new transaction,
  // so the async fetch below never has to clear stale state from inside the
  // effect body. Mirrors the render-phase sync used by useTransactionsPanel.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (syncedId !== activeId) {
    setSyncedId(activeId);
    setForm(EMPTY_FORM);
    setHasEntry(false);
    setLoading(activeId !== null);
  }

  // Hydrate the form from the existing entry. Only the lightweight summary
  // ships with the list, so the full entry (note + emotions) is fetched here.
  useEffect(() => {
    if (!open || !transactionId) return;

    let cancelled = false;
    getTransactionJournalEntry(transactionId)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.entry) {
          setHasEntry(true);
          setForm({
            note: result.entry.note ?? "",
            tradeReason: result.entry.tradeReason,
            emotions: result.entry.emotions,
            confidence: result.entry.confidence,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  function toggleEmotion(emotion: TradeJournalEmotion) {
    setForm((prev) => ({
      ...prev,
      emotions: prev.emotions.includes(emotion)
        ? prev.emotions.filter((value) => value !== emotion)
        : [...prev.emotions, emotion],
    }));
  }

  function handleSave() {
    if (!transactionId) return;
    startSaving(async () => {
      const result = await saveTransactionJournalEntry(transactionId, {
        note: form.note,
        tradeReason: form.tradeReason,
        emotions: form.emotions,
        confidence: form.confidence,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(hasEntry ? "Journal entry updated" : "Journal entry saved");
      onOpenChange(false);
    });
  }

  function handleRemove() {
    if (!transactionId) return;
    startRemoving(async () => {
      const result = await removeTransactionJournalEntry(transactionId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Journal entry removed");
      onOpenChange(false);
    });
  }

  const busy = saving || removing;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{hasEntry ? "Edit journal entry" : "Add journal entry"}</SheetTitle>
          {transaction ? (
            <SheetDescription>{transactionLabel(transaction)}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="journal-note">Note</Label>
            <Textarea
              id="journal-note"
              rows={5}
              placeholder="What was the thinking behind this trade?"
              value={form.note}
              disabled={loading || busy}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, note: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="journal-reason">Trade reason</Label>
            <Select
              value={form.tradeReason ?? NONE_VALUE}
              disabled={loading || busy}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  tradeReason:
                    value === NONE_VALUE
                      ? null
                      : (value as TradeJournalReason),
                }))
              }
            >
              <SelectTrigger id="journal-reason" className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>No reason</SelectItem>
                {TRADE_JOURNAL_REASON_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Emotions</Label>
            <div className="flex flex-wrap gap-1.5">
              {TRADE_JOURNAL_EMOTION_OPTIONS.map(([value, label]) => {
                const selected = form.emotions.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={loading || busy}
                    aria-pressed={selected}
                    onClick={() => toggleEmotion(value)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-4xl border px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="journal-confidence">Confidence</Label>
            <Select
              value={
                form.confidence === null ? NONE_VALUE : String(form.confidence)
              }
              disabled={loading || busy}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  confidence: value === NONE_VALUE ? null : Number(value),
                }))
              }
            >
              <SelectTrigger id="journal-confidence" className="w-full">
                <SelectValue placeholder="Rate your conviction (1–10)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Not rated</SelectItem>
                {CONFIDENCE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} / 10
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={loading || busy}>
            {saving ? (
              <RiLoader4Line className="animate-spin" />
            ) : null}
            {hasEntry ? "Save changes" : "Save entry"}
          </Button>
          {hasEntry ? (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={loading || busy}
            >
              {removing ? (
                <RiLoader4Line className="animate-spin" />
              ) : (
                <RiDeleteBinLine />
              )}
              Remove entry
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
