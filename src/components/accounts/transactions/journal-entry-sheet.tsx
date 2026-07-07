"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiSaveLine,
} from "@remixicon/react";
import { toast } from "sonner";

import {
  getTransactionJournalEntry,
  removeTransactionJournalEntry,
  saveTransactionJournalEntry,
} from "@/app/actions";
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
import { Badge } from "@/components/ui/badge";
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
  TradeJournalEntryRow,
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

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

function sameForm(left: FormState, right: FormState): boolean {
  return (
    left.note === right.note &&
    left.tradeReason === right.tradeReason &&
    left.marketBias === right.marketBias &&
    left.emotions.length === right.emotions.length &&
    left.emotions.every((emotion, index) => emotion === right.emotions[index])
  );
}

function formFromEntry(entry: TradeJournalEntryRow | null): FormState {
  return {
    note: entry?.note ?? "",
    tradeReason: entry?.tradeReason ?? null,
    emotions: entry?.emotions ?? [],
    marketBias: entry?.marketBias ?? null,
  };
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") return <Badge variant="secondary">Saving…</Badge>;
  if (status === "saved") {
    return (
      <Badge variant="secondary">
        <RiSaveLine data-icon="inline-start" />
        Saved
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <RiErrorWarningLine data-icon="inline-start" />
        Save failed
      </Badge>
    );
  }
  if (status === "conflict") {
    return <Badge variant="destructive">Edit conflict</Badge>;
  }
  return <Badge variant="outline">Not saved yet</Badge>;
}

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
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [persistedForm, setPersistedForm] = useState<FormState>(EMPTY_FORM);
  const [entry, setEntry] = useState<TradeJournalEntryRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverConflict, setServerConflict] =
    useState<TradeJournalEntryRow | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [imageMutationPending, setImageMutationPending] = useState(false);
  const [removing, startRemoving] = useTransition();
  const saveQueueRef = useRef(Promise.resolve());
  const enqueuedFingerprintsRef = useRef(new Set<string>());
  const currentFormRef = useRef(form);
  const entryRef = useRef(entry);
  const activeIdRef = useRef<string | null>(null);

  const transactionId = transaction?.id ?? null;
  const activeId = open ? transactionId : null;

  // Reset the form during render whenever the sheet targets a new transaction,
  // so the async fetch below never has to clear stale state from inside the
  // effect body. Mirrors the render-phase sync used by useTransactionsPanel.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (syncedId !== activeId) {
    setSyncedId(activeId);
    setForm(EMPTY_FORM);
    setPersistedForm(EMPTY_FORM);
    setEntry(null);
    setStatus("idle");
    setSaveError(null);
    setServerConflict(null);
    setLoading(activeId !== null);
  }

  useEffect(() => {
    activeIdRef.current = activeId;
    enqueuedFingerprintsRef.current.clear();
    saveQueueRef.current = Promise.resolve();
  }, [activeId]);

  useEffect(() => {
    currentFormRef.current = form;
  }, [form]);
  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

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
          const nextForm = formFromEntry(result.entry);
          setEntry(result.entry);
          entryRef.current = result.entry;
          setForm(nextForm);
          setPersistedForm(nextForm);
          setStatus("saved");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  const dirty = !sameForm(form, persistedForm);
  const warnBeforeLeaving =
    dirty ||
    imageMutationPending ||
    status === "saving" ||
    status === "error" ||
    status === "conflict";

  useEffect(() => {
    if (!open || !warnBeforeLeaving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) =>
      event.preventDefault();
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") {
        return;
      }
      if (
        !window.confirm(
          "Your latest Transaction Journal Entry changes have not been saved. Leave anyway?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [open, warnBeforeLeaving]);

  const runSave = useCallback(
    (snapshot: FormState, overwrite = false): Promise<boolean> => {
      if (!transactionId) return Promise.resolve(false);
      const savingTransactionId = transactionId;
      const fingerprint = JSON.stringify(snapshot);
      enqueuedFingerprintsRef.current.add(fingerprint);
      setStatus("saving");
      setSaveError(null);
      const operation = saveQueueRef.current.then(async () => {
        let result;
        try {
          result = await saveTransactionJournalEntry(
            transactionId,
            snapshot,
            entryRef.current?.updatedAt.toISOString() ?? null,
            overwrite,
          );
        } catch {
          result = {
            status: "error" as const,
            message: "The server could not be reached.",
          };
        }
        if (activeIdRef.current !== savingTransactionId) return false;
        enqueuedFingerprintsRef.current.delete(fingerprint);
        if (result.status === "conflict") {
          setServerConflict(result.entry);
          setStatus("conflict");
          return false;
        }
        if (result.status === "error") {
          setSaveError(result.message);
          setStatus("error");
          window.setTimeout(
            () => setRetryVersion((version) => version + 1),
            3_000,
          );
          return false;
        }
        const materialized = entryRef.current === null && result.entry !== null;
        setEntry(result.entry);
        entryRef.current = result.entry;
        setPersistedForm(snapshot);
        setStatus(
          sameForm(currentFormRef.current, snapshot) ? "saved" : "idle",
        );
        if (materialized) router.refresh();
        return true;
      });
      saveQueueRef.current = operation.then(() => undefined);
      return operation;
    },
    [router, transactionId],
  );

  useEffect(() => {
    if (!open || loading || status === "conflict" || !dirty) return;
    const fingerprint = JSON.stringify(form);
    if (enqueuedFingerprintsRef.current.has(fingerprint)) return;
    const timer = window.setTimeout(() => void runSave(form), 750);
    return () => window.clearTimeout(timer);
  }, [dirty, form, loading, open, retryVersion, runSave, status]);

  function updateImmediately(update: (current: FormState) => FormState) {
    const next = update(currentFormRef.current);
    currentFormRef.current = next;
    setForm(next);
    void runSave(next);
  }

  function toggleEmotion(emotion: TradeJournalEmotion) {
    updateImmediately((current) => ({
      ...current,
      emotions: current.emotions.includes(emotion)
        ? current.emotions.filter((value) => value !== emotion)
        : [...current.emotions, emotion],
    }));
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
      setEntry(null);
      entryRef.current = null;
      setForm(EMPTY_FORM);
      setPersistedForm(EMPTY_FORM);
      router.refresh();
      onOpenChange(false);
    });
  }

  function requestOpenChange(nextOpen: boolean) {
    if (
      !nextOpen &&
      warnBeforeLeaving &&
      !window.confirm(
        "Your latest Transaction Journal Entry changes have not been saved. Close anyway?",
      )
    ) {
      return;
    }
    onOpenChange(nextOpen);
  }

  function reloadServerVersion() {
    if (!serverConflict) return;
    const nextForm = formFromEntry(serverConflict);
    setEntry(serverConflict);
    entryRef.current = serverConflict;
    setForm(nextForm);
    setPersistedForm(nextForm);
    setServerConflict(null);
    setSaveError(null);
    setStatus("saved");
    enqueuedFingerprintsRef.current.clear();
  }

  function overwriteServerVersion() {
    if (!serverConflict) return;
    setEntry(serverConflict);
    entryRef.current = serverConflict;
    setServerConflict(null);
    void runSave(currentFormRef.current, true);
  }

  const syncEntryVersion = useCallback((updatedAt: string, entryId?: string) => {
    const current = entryRef.current;
    if (current) {
      const next = { ...current, updatedAt: new Date(updatedAt) };
      setEntry(next);
      entryRef.current = next;
      setStatus("saved");
    } else if (entryId && transactionId) {
      const next: TradeJournalEntryRow = {
        id: entryId,
        transactionId,
        ...currentFormRef.current,
        note: currentFormRef.current.note || null,
        createdAt: new Date(updatedAt),
        updatedAt: new Date(updatedAt),
      };
      setEntry(next);
      entryRef.current = next;
      setPersistedForm(currentFormRef.current);
      setStatus("saved");
      router.refresh();
    }
  }, [router, transactionId]);

  const prepareForImageMutation = useCallback(async () => {
    if (status === "conflict" || status === "error") return false;
    if (dirty || status === "saving") return runSave(currentFormRef.current);
    await saveQueueRef.current;
    return true;
  }, [dirty, runSave, status]);

  const busy = removing;
  const description = transaction
    ? transactionDescription(transaction)
    : null;

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-lg data-[side=right]:lg:max-w-2xl data-[side=right]:xl:max-w-[60vw]">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>{entry ? "Edit journal entry" : "Add journal entry"}</SheetTitle>
            <SaveIndicator status={status} />
          </div>
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
              disabled={loading || busy}
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
            onEntryVersionChanged={syncEntryVersion}
            onPendingChange={setImageMutationPending}
            beforeMutation={prepareForImageMutation}
          />
          {saveError ? (
            <p role="alert" className="text-sm text-destructive">
              {saveError} Changes will retry while this sheet remains open.
            </p>
          ) : null}
        </div>

        <SheetFooter>
          {entry ? (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={loading || busy || warnBeforeLeaving}
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
            <AlertDialogCancel onClick={reloadServerVersion}>
              Reload server version
            </AlertDialogCancel>
            <AlertDialogAction onClick={overwriteServerVersion}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
