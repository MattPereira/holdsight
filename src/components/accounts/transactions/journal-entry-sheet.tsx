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
  SelectGroup,
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
import { JournalImagesSection } from "@/components/journal/journal-images-section";
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
// to "no selection" for the nullable reason and market bias fields.
const NONE_VALUE = "__none__";
const MARKET_BIAS_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const value = index + 1;
  const label =
    value === 1
      ? "1 — Bearish"
      : value === 5
        ? "5 — Neutral"
        : value === 10
          ? "10 — Bullish"
          : String(value);
  return [value, label] as const;
});

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const TRANSACTION_ACTION_LABELS: Record<
  InvestmentTransactionListItem["side"],
  string
> = {
  buy: "Bought",
  sell: "Sold",
  swap: "Bought",
  open: "Opened",
  close: "Closed",
  increase: "Increased",
  decrease: "Reduced",
  receive: "Received",
  send: "Sent",
  unknown: "Transaction",
};

type FormState = {
  note: string;
  tradeReason: TradeJournalReason | null;
  emotions: TradeJournalEmotion[];
  marketBias: number | null;
};

const EMPTY_FORM: FormState = {
  note: "",
  tradeReason: null,
  emotions: [],
  marketBias: null,
};

function transactionDescription(
  transaction: InvestmentTransactionListItem,
): { dateTime: string; trade: string | null } {
  const when = dateTimeFormat.format(new Date(transaction.executedAt));
  const baseAsset =
    transaction.baseAmount !== null && transaction.baseAssetSymbol
      ? `${amountFormat.format(Math.abs(transaction.baseAmount))} ${transaction.baseAssetSymbol}`
      : null;
  const quoteAsset =
    transaction.quoteAmount !== null && transaction.quoteAssetSymbol
      ? `${amountFormat.format(Math.abs(transaction.quoteAmount))} ${transaction.quoteAssetSymbol}`
      : transaction.valueUsd !== null
        ? usdFormat.format(Math.abs(transaction.valueUsd))
        : null;

  if (baseAsset) {
    const action = TRANSACTION_ACTION_LABELS[transaction.side];
    const isExchange =
      transaction.side === "buy" ||
      transaction.side === "sell" ||
      transaction.side === "swap";
    const trade = isExchange && quoteAsset
      ? `${action} ${baseAsset} for ${quoteAsset}`
      : `${action} ${baseAsset}`;
    return { dateTime: when, trade };
  }

  return { dateTime: when, trade: null };
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
            marketBias: result.entry.marketBias,
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
    if (form.tradeReason === null || form.marketBias === null) {
      toast.error("Choose a trade reason and market bias.");
      return;
    }
    startSaving(async () => {
      const result = await saveTransactionJournalEntry(transactionId, {
        note: form.note,
        tradeReason: form.tradeReason,
        emotions: form.emotions,
        marketBias: form.marketBias,
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
  const canSave = form.tradeReason !== null && form.marketBias !== null;
  const description = transaction
    ? transactionDescription(transaction)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-lg data-[side=right]:lg:max-w-2xl data-[side=right]:xl:max-w-[60vw]">
        <SheetHeader>
          <SheetTitle>{hasEntry ? "Edit journal entry" : "Add journal entry"}</SheetTitle>
          {description ? (
            <SheetDescription className="flex flex-col">
              <span>{description.dateTime}</span>
              {description.trade ? <span>{description.trade}</span> : null}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
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
              <SelectTrigger
                id="journal-reason"
                className="w-full"
                aria-required="true"
              >
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE_VALUE}>Choose</SelectItem>
                  {TRADE_JOURNAL_REASON_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="journal-market-bias">Market bias</Label>
            <Select
              value={
                form.marketBias === null ? NONE_VALUE : String(form.marketBias)
              }
              disabled={loading || busy}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  marketBias: value === NONE_VALUE ? null : Number(value),
                }))
              }
            >
              <SelectTrigger
                id="journal-market-bias"
                className="w-full"
                aria-required="true"
              >
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE_VALUE}>Choose</SelectItem>
                  {MARKET_BIAS_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={String(value)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
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
            <Label htmlFor="journal-note">Notes</Label>
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

          <JournalImagesSection
            endpoint={
              transactionId
                ? `/api/investment-transactions/${transactionId}/journal-images`
                : null
            }
            open={open}
            disabled={busy}
            onEntryMaterialized={() => setHasEntry(true)}
          />
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={loading || busy || !canSave}>
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
