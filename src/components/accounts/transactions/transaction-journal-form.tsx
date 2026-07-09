"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RiArrowLeftLine } from "@remixicon/react";
import { toast } from "sonner";

import {
  getTransactionJournalEntry,
  saveTransactionJournalEntry,
} from "@/components/accounts/transactions/actions";
import {
  Leg,
  transactionLegs,
} from "@/components/accounts/transactions/transaction-legs";
import { SaveIndicator } from "@/components/journal/save-indicator";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JournalImagesSection } from "@/components/journal/journal-images-section";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type {
  TransactionJournalEntry,
  TradeJournalEmotion,
  TradeJournalReason,
} from "@/lib/journal/transaction-entry";
import {
  TRADE_JOURNAL_EMOTION_OPTIONS,
  TRADE_JOURNAL_REASON_OPTIONS,
} from "@/lib/journal/transaction-entry-labels";
import { useAutosaveEntry } from "@/lib/journal/use-autosave-entry";
import { useUnsavedChangesGuard } from "@/lib/journal/use-unsaved-changes-guard";
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

const transactionDateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const transactionTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

type FormState = {
  note: string;
  tradeReason: TradeJournalReason | null;
  emotions: TradeJournalEmotion[];
  marketBias: number | null;
};

const UNSAVED_CHANGES_MESSAGE =
  "Your latest Transaction Journal Entry changes have not been saved. Leave anyway?";

function sameForm(left: FormState, right: FormState): boolean {
  return (
    left.note === right.note &&
    left.tradeReason === right.tradeReason &&
    left.marketBias === right.marketBias &&
    left.emotions.length === right.emotions.length &&
    left.emotions.every((emotion, index) => emotion === right.emotions[index])
  );
}

function formFromEntry(entry: TransactionJournalEntry | null): FormState {
  return {
    note: entry?.note ?? "",
    tradeReason: entry?.tradeReason ?? null,
    emotions: entry?.emotions ?? [],
    marketBias: entry?.marketBias ?? null,
  };
}

export function TransactionJournalForm({
  transaction,
  onBack,
}: {
  transaction: InvestmentTransactionListItem;
  onBack: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [imageMutationPending, setImageMutationPending] = useState(false);

  const transactionId = transaction.id;

  const autosave = useAutosaveEntry<FormState, TransactionJournalEntry>({
    key: transactionId,
    initialEntry: null,
    enabled: !loading,
    draftFromEntry: formFromEntry,
    sameDraft: sameForm,
    save: (snapshot, currentEntry, overwrite) =>
      saveTransactionJournalEntry(
        transactionId,
        snapshot,
        currentEntry?.updatedAt ?? null,
        overwrite,
      ),
    // Refresh the surrounding transaction list only when the entry's
    // existence toggles (materialized or removed) — a plain content update
    // doesn't need to invalidate the list's own "has journal entry" badge.
    onEntryChange: (nextEntry, previousEntry) => {
      if (Boolean(previousEntry) !== Boolean(nextEntry)) router.refresh();
    },
  });
  const { draft: form, status, saveError } = autosave;

  // Hydrate the form from the existing entry. Only the lightweight summary
  // ships with the list, so the full entry (note + emotions) is fetched here.
  // This component is mounted fresh per selected transaction, so the effect
  // only ever needs to run once, on mount.
  useEffect(() => {
    let cancelled = false;
    getTransactionJournalEntry(transactionId)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.entry) autosave.hydrate(result.entry);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `autosave` is a fresh object every render, so it can't be a dep
    // without re-running this effect on every keystroke; `autosave.hydrate`
    // itself is stable (empty-deps useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  const warnBeforeLeaving =
    autosave.dirty ||
    imageMutationPending ||
    status === "saving" ||
    status === "error" ||
    status === "conflict";
  const { confirmLeave } = useUnsavedChangesGuard(
    warnBeforeLeaving,
    UNSAVED_CHANGES_MESSAGE,
  );

  function updateImmediately(update: (current: FormState) => FormState) {
    autosave.setDraft(update);
    autosave.commitNow();
  }

  function toggleEmotion(emotion: TradeJournalEmotion) {
    updateImmediately((current) => ({
      ...current,
      emotions: current.emotions.includes(emotion)
        ? current.emotions.filter((value) => value !== emotion)
        : [...current.emotions, emotion],
    }));
  }

  function handleBack() {
    if (!confirmLeave()) return;
    onBack();
  }

  function handleEntryVersionChanged(updatedAt: string, entryId?: string) {
    autosave.syncEntryVersion(updatedAt, entryId, (draft, id) => ({
      id,
      transactionId,
      ...draft,
      note: draft.note || null,
      createdAt: updatedAt,
      updatedAt,
    }));
  }

  const executedAt = new Date(transaction.executedAt);
  const legs = transactionLegs(transaction);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="-ml-2 self-start"
            onClick={handleBack}
          >
            <RiArrowLeftLine data-icon="inline-start" />
            Back
          </Button>
          <SaveIndicator status={status} />
        </div>
        <div className="flex items-start gap-1 border-y py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base">
              {transaction.accountLabel ?? "—"}
            </span>
            <span className="text-sm text-muted-foreground">
              {transactionDateFormat.format(executedAt)}
            </span>
            <span className="text-sm text-muted-foreground">
              {transactionTimeFormat.format(executedAt)}
            </span>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1">
            {legs.map((leg, index) => (
              <Leg key={index} leg={leg} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="journal-reason">Trade reason</Label>
          <Select
            value={form.tradeReason ?? NONE_VALUE}
            disabled={loading}
            onValueChange={(value) =>
              updateImmediately((prev) => ({
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
            disabled={loading}
            onValueChange={(value) =>
              updateImmediately((prev) => ({
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
                  disabled={loading}
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
            disabled={loading}
            onChange={(event) =>
              autosave.setDraft((prev) => ({
                ...prev,
                note: event.target.value,
              }))
            }
          />
        </div>

        <JournalImagesSection
          endpoint={`/api/investment-transactions/${transactionId}/journal-images`}
          open
          disabled={loading}
          onEntryVersionChanged={handleEntryVersionChanged}
          onPendingChange={setImageMutationPending}
          beforeMutation={autosave.flushBeforeMutation}
        />
        {saveError ? (
          <p role="alert" className="text-sm text-destructive">
            {saveError} Changes will retry while this view remains open.
          </p>
        ) : null}
      </div>

      <AlertDialog open={status === "conflict"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              This Transaction Journal Entry changed elsewhere
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your local edits are still visible. Reload the server version or
              deliberately overwrite it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={autosave.reloadServerVersion}>
              Reload server version
            </AlertDialogCancel>
            <AlertDialogAction onClick={autosave.overwriteServerVersion}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
