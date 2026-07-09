"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCalendarLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiRefreshLine,
  RiSaveLine,
} from "@remixicon/react";
import { toast } from "sonner";

import {
  confirmHomeTimezone,
  deleteJournalEntry,
  saveJournalEntry,
} from "@/app/(app)/journal/actions";
import { JournalImagesSection } from "@/components/journal/journal-images-section";
import { RecentJournalEntries } from "@/components/journal/recent-journal-entries";
import { JournalTransactionContext } from "@/components/journal/journal-transaction-context";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  InvestmentJournalEntry,
  JournalWorkspace as JournalWorkspaceData,
} from "@/lib/journal/investment-entry";
import { journalStripLabel, periodLabel } from "@/lib/journal/period-label";
import {
  canonicalPeriodStart,
  JOURNAL_STRIP_MOBILE_SIZE,
  JOURNAL_STRIP_SIZE,
  journalStripMobileVisibleIndices,
  moveJournalPeriod,
  type JournalPeriodType,
} from "@/lib/journal/periods";
import {
  useAutosaveEntry,
  type SaveStatus,
} from "@/lib/journal/use-autosave-entry";
import { useUnsavedChangesGuard } from "@/lib/journal/use-unsaved-changes-guard";
import { cn } from "@/lib/utils";

type Draft = { plan: string; reflection: string };
type JournalView = "write" | "history" | "transactions";

const MAX_LENGTH = 10_000;
const UNSAVED_CHANGES_MESSAGE =
  "Your latest journal changes have not been saved. Leave anyway?";

const PERIOD_UNIT: Record<JournalPeriodType, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

function todayInTimezone(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function draftFromEntry(entry: InvestmentJournalEntry | null): Draft {
  return { plan: entry?.plan ?? "", reflection: entry?.reflection ?? "" };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return left.plan === right.plan && left.reflection === right.reflection;
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <Badge variant="secondary">Saving…</Badge>;
  }
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

function JournalPeriodStrip({
  periodType,
  selectedDate,
  stripDates,
  entryDates,
  onSelect,
}: {
  periodType: JournalPeriodType;
  selectedDate: string;
  stripDates: string[];
  entryDates: string[];
  onSelect: (date: string) => void;
}) {
  const selectedIndex = stripDates.indexOf(selectedDate);
  const mobileVisible = new Set(
    journalStripMobileVisibleIndices(
      stripDates.length,
      selectedIndex === -1 ? 0 : selectedIndex,
      JOURNAL_STRIP_MOBILE_SIZE[periodType],
    ),
  );

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5"
      role="group"
      aria-label={`Choose a ${PERIOD_UNIT[periodType]}`}
    >
      {stripDates.map((date, index) => {
        const isSelected = date === selectedDate;
        const hasEntry = entryDates.includes(date);
        const label = journalStripLabel(periodType, date);
        return (
          <Button
            key={date}
            type="button"
            variant={isSelected ? "default" : "outline"}
            size="sm"
            aria-current={isSelected ? "date" : undefined}
            aria-label={`${label.top}${label.bottom ? ` ${label.bottom}` : ""}${hasEntry ? " · entry recorded" : ""}`}
            className={cn(
              "relative h-12 min-w-0 flex-1 basis-0 flex-col justify-center gap-0 px-2 leading-tight",
              !mobileVisible.has(index) && "hidden sm:flex",
            )}
            onClick={() => onSelect(date)}
          >
            <span
              className={cn(
                label.bottom
                  ? "text-[11px] opacity-80"
                  : "text-sm font-medium",
              )}
            >
              {label.top}
            </span>
            {label.bottom ? (
              <span className="text-sm font-medium">{label.bottom}</span>
            ) : null}
            {hasEntry ? (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 size-1.5 rounded-full bg-current opacity-70"
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export function JournalWorkspace({
  periodType,
  selectedDate,
  initialWorkspace,
  dateWasRequested,
  stripDates,
  stripEntryDates,
}: {
  periodType: JournalPeriodType;
  selectedDate: string;
  initialWorkspace: JournalWorkspaceData;
  dateWasRequested: boolean;
  stripDates: string[];
  stripEntryDates: string[];
}) {
  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [homeTimezone, setHomeTimezone] = useState(
    initialWorkspace.homeTimezone ?? "",
  );
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(
    initialWorkspace.homeTimezone !== null,
  );
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [confirmingTimezone, startConfirmingTimezone] = useTransition();
  const [imageMutationPending, setImageMutationPending] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [deleting, startDeleting] = useTransition();
  const [view, setView] = useState<JournalView>("write");
  const imageEndpoint = `/api/investment-journal/images?type=${periodType}&date=${selectedDate}`;

  const autosave = useAutosaveEntry<Draft, InvestmentJournalEntry>({
    key: `${periodType}:${selectedDate}`,
    initialEntry: initialWorkspace.entry,
    enabled: timezoneConfirmed,
    draftFromEntry,
    sameDraft,
    save: (snapshot, currentEntry, overwrite) =>
      saveJournalEntry({
        periodType,
        periodStart: selectedDate,
        plan: snapshot.plan,
        reflection: snapshot.reflection,
        entryId: currentEntry?.id ?? null,
        expectedUpdatedAt: currentEntry?.updatedAt ?? null,
        overwrite,
      }),
    onEntryChange: () => setHistoryRevision((revision) => revision + 1),
  });
  const { draft, entry, status, saveError } = autosave;

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

  useEffect(() => {
    if (initialWorkspace.homeTimezone || homeTimezone) return;
    const timer = window.setTimeout(() => {
      setHomeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [homeTimezone, initialWorkspace.homeTimezone]);

  useEffect(() => {
    const browserDate = initialWorkspace.homeTimezone
      ? selectedDate
      : canonicalPeriodStart(periodType, todayInTimezone());
    const canonicalUrl = `/journal?type=${periodType}&date=${browserDate}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (!dateWasRequested || currentUrl !== canonicalUrl) {
      router.replace(canonicalUrl);
    }
  }, [
    dateWasRequested,
    initialWorkspace.homeTimezone,
    periodType,
    router,
    selectedDate,
  ]);

  function confirmTimezone() {
    startConfirmingTimezone(async () => {
      const result = await confirmHomeTimezone(homeTimezone.trim());
      if (result.error) {
        setTimezoneError(result.error);
        return;
      }
      setHomeTimezone(result.homeTimezone ?? homeTimezone);
      setTimezoneConfirmed(true);
      setTimezoneError(null);
      router.refresh();
    });
  }

  function navigateTo(type: JournalPeriodType, date: string) {
    if (!confirmLeave()) return;
    router.push(
      `/journal?type=${type}&date=${canonicalPeriodStart(type, date)}`,
    );
  }

  function removeEntry() {
    if (!entry) return;
    startDeleting(async () => {
      const result = await deleteJournalEntry(entry.id, periodType);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      autosave.applyServerEntry(null);
      setImageRevision((revision) => revision + 1);
    });
  }

  function handleEntryVersionChanged(updatedAt: string, entryId?: string) {
    autosave.syncEntryVersion(updatedAt, entryId, (draft, id) => ({
      id,
      periodType,
      periodStart: selectedDate,
      plan: draft.plan,
      reflection: draft.reflection,
      updatedAt,
    }));
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
        {timezoneConfirmed ? (
          <>
            <Tabs
              value={periodType}
              onValueChange={(value) =>
                navigateTo(value as JournalPeriodType, selectedDate)
              }
            >
              <TabsList aria-label="Journal Period type">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="icon"
              aria-label="Jump to a specific date"
              onClick={() => dateInputRef.current?.showPicker?.()}
            >
              <RiCalendarLine />
            </Button>
            <input
              ref={dateInputRef}
              className="sr-only"
              type={periodType === "monthly" ? "month" : "date"}
              value={
                periodType === "monthly"
                  ? selectedDate.slice(0, 7)
                  : selectedDate
              }
              aria-label={`${periodType} Journal Period`}
              onChange={(event) =>
                navigateTo(
                  periodType,
                  periodType === "monthly"
                    ? `${event.target.value}-01`
                    : event.target.value,
                )
              }
            />
          </>
        ) : null}
      </div>

      {!timezoneConfirmed ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Confirm your home timezone</CardTitle>
            <CardDescription>
              Journal days stay anchored to this timezone. You can correct it
              now, but it locks after your first Investment Journal Entry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field data-invalid={Boolean(timezoneError)}>
              <FieldLabel htmlFor="home-timezone">IANA timezone</FieldLabel>
              <Input
                id="home-timezone"
                value={homeTimezone}
                placeholder="America/Los_Angeles"
                aria-invalid={Boolean(timezoneError)}
                onChange={(event) => setHomeTimezone(event.target.value)}
              />
              <FieldDescription>
                Detected from this browser. Change it if this is not your home
                timezone.
              </FieldDescription>
              <FieldError>{timezoneError}</FieldError>
            </Field>
          </CardContent>
          <CardFooter>
            <Button
              disabled={confirmingTimezone || !homeTimezone.trim()}
              onClick={confirmTimezone}
            >
              Confirm timezone
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <div
            className={cn(
              "flex items-center gap-2",
              view === "history" && "hidden",
            )}
          >
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={`Previous ${JOURNAL_STRIP_SIZE[periodType]} ${PERIOD_UNIT[periodType]}s`}
              onClick={() =>
                navigateTo(
                  periodType,
                  moveJournalPeriod(
                    periodType,
                    selectedDate,
                    -JOURNAL_STRIP_SIZE[periodType],
                  ),
                )
              }
            >
              <RiArrowLeftSLine />
            </Button>
            <JournalPeriodStrip
              periodType={periodType}
              selectedDate={selectedDate}
              stripDates={stripDates}
              entryDates={stripEntryDates}
              onSelect={(date) => navigateTo(periodType, date)}
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={`Next ${JOURNAL_STRIP_SIZE[periodType]} ${PERIOD_UNIT[periodType]}s`}
              onClick={() =>
                navigateTo(
                  periodType,
                  moveJournalPeriod(
                    periodType,
                    selectedDate,
                    JOURNAL_STRIP_SIZE[periodType],
                  ),
                )
              }
            >
              <RiArrowRightSLine />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Tabs
                value={view}
                onValueChange={(value) => setView(value as JournalView)}
              >
                <TabsList aria-label="Journal view">
                  <TabsTrigger value="write">Record</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="transactions">Trades</TabsTrigger>
                </TabsList>
              </Tabs>
              {view === "history" ? (
                <span className="text-muted-foreground text-sm">
                  Recent {periodType} journal entries
                </span>
              ) : null}
              {view === "transactions" ? (
                <span className="text-muted-foreground text-sm">
                  Trades for {periodLabel(periodType, selectedDate)}
                </span>
              ) : null}
            </div>
            {view === "write" ? <SaveIndicator status={status} /> : null}
          </div>

          <div className="flex flex-col gap-6">
            <div
              className={cn(
                "flex min-w-0 flex-col gap-6",
                view !== "write" && "hidden",
              )}
            >
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <h2 className="font-medium">Plan</h2>
                  <Field>
                    <FieldLabel className="sr-only" htmlFor="journal-plan">
                      Plan
                    </FieldLabel>
                    <Textarea
                      id="journal-plan"
                      className="min-h-72 resize-y"
                      maxLength={MAX_LENGTH}
                      value={draft.plan}
                      placeholder="What is your plan for this period?"
                      onChange={(event) => {
                        autosave.setDraft((current) => ({
                          ...current,
                          plan: event.target.value,
                        }));
                      }}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-3">
                  <h2 className="font-medium">Reflection</h2>
                  <Field>
                    <FieldLabel className="sr-only" htmlFor="journal-reflection">
                      Reflection
                    </FieldLabel>
                    <Textarea
                      id="journal-reflection"
                      className="min-h-72 resize-y"
                      maxLength={MAX_LENGTH}
                      value={draft.reflection}
                      placeholder="What happened and what did you learn?"
                      onChange={(event) => {
                        autosave.setDraft((current) => ({
                          ...current,
                          reflection: event.target.value,
                        }));
                      }}
                    />
                  </Field>
                </div>
              </div>

              <JournalImagesSection
                key={`${periodType}:${selectedDate}:${imageRevision}`}
                endpoint={imageEndpoint}
                open
                disabled={
                  deleting || status === "error" || status === "conflict"
                }
                beforeMutation={autosave.flushBeforeMutation}
                onEntryVersionChanged={handleEntryVersionChanged}
                onPendingChange={setImageMutationPending}
              />

              {entry ? (
                <div className="flex justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        disabled={deleting || warnBeforeLeaving}
                        aria-label="Delete entry"
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete this Investment Journal Entry?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This explicitly removes the entry for {selectedDate}.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={removeEntry}
                        >
                          Delete entry
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}

              {status === "error" ? (
            <Card>
              <CardHeader>
                <CardTitle>Save failed</CardTitle>
                <CardDescription>
                  {saveError} Your visible edits are preserved and the save will
                  retry while this page remains open.
                </CardDescription>
              </CardHeader>
            </Card>
              ) : null}

              {status === "conflict" ? (
            <Card>
              <CardHeader>
                <CardTitle>This entry changed elsewhere</CardTitle>
                <CardDescription>
                  Autosave is paused. Your local edits remain visible until you
                  choose a version.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex-wrap">
                <Button variant="outline" onClick={autosave.reloadServerVersion}>
                  <RiRefreshLine data-icon="inline-start" />
                  Reload server version
                </Button>
                <Button onClick={autosave.overwriteServerVersion}>
                  Overwrite with my edits
                </Button>
              </CardFooter>
            </Card>
              ) : null}
            </div>

            {view === "history" ? (
              <RecentJournalEntries
                periodType={periodType}
                revision={historyRevision}
                onSelect={(periodStart) => {
                  setView("write");
                  navigateTo(periodType, periodStart);
                }}
              />
            ) : null}

            {view === "transactions" ? (
              <JournalTransactionContext
                transactions={initialWorkspace.transactions}
                homeTimezone={homeTimezone}
              />
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
