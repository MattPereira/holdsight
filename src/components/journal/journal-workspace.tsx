"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiRefreshLine,
  RiSaveLine,
} from "@remixicon/react";

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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  InvestmentJournalEntry,
  JournalWorkspace as JournalWorkspaceData,
} from "@/lib/investment-journal/journal";
import {
  canonicalPeriodStart,
  moveJournalPeriod,
  type JournalPeriodType,
} from "@/lib/investment-journal/periods";

type Draft = { plan: string; reflection: string };
type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

const MAX_LENGTH = 10_000;

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

export function JournalWorkspace({
  periodType,
  selectedDate,
  initialWorkspace,
  dateWasRequested,
}: {
  periodType: JournalPeriodType;
  selectedDate: string;
  initialWorkspace: JournalWorkspaceData;
  dateWasRequested: boolean;
}) {
  const router = useRouter();
  const [homeTimezone, setHomeTimezone] = useState(
    initialWorkspace.homeTimezone ?? "",
  );
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(
    initialWorkspace.homeTimezone !== null,
  );
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [confirmingTimezone, startConfirmingTimezone] = useTransition();
  const [entry, setEntry] = useState(initialWorkspace.entry);
  const [draft, setDraft] = useState(() =>
    draftFromEntry(initialWorkspace.entry),
  );
  const [persistedDraft, setPersistedDraft] = useState(() =>
    draftFromEntry(initialWorkspace.entry),
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverConflict, setServerConflict] =
    useState<InvestmentJournalEntry | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [imageMutationPending, setImageMutationPending] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [deleting, startDeleting] = useTransition();
  const enqueuedFingerprintsRef = useRef(new Set<string>());
  const saveQueueRef = useRef(Promise.resolve());
  const currentDraftRef = useRef(draft);
  const entryRef = useRef(entry);

  const dirty = !sameDraft(draft, persistedDraft);
  const timezoneLocked = initialWorkspace.timezoneLocked || entry !== null;
  const warnBeforeLeaving =
    dirty ||
    imageMutationPending ||
    status === "saving" ||
    status === "error" ||
    status === "conflict";
  const imageEndpoint = `/api/investment-journal/images?type=${periodType}&date=${selectedDate}`;

  useEffect(() => {
    if (initialWorkspace.homeTimezone || homeTimezone) return;
    const timer = window.setTimeout(() => {
      setHomeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [homeTimezone, initialWorkspace.homeTimezone]);

  useEffect(() => {
    currentDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

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

  useEffect(() => {
    if (!warnBeforeLeaving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank")
        return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (
        !window.confirm(
          "Your latest journal changes have not been saved. Leave anyway?",
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
  }, [warnBeforeLeaving]);

  const runSave = useCallback(
    (snapshot: Draft, overwrite = false): Promise<boolean> => {
      const fingerprint = JSON.stringify(snapshot);
      enqueuedFingerprintsRef.current.add(fingerprint);
      setStatus("saving");
      setSaveError(null);

      const operation = saveQueueRef.current.then(async () => {
        setStatus("saving");
        let result;
        try {
          const currentEntry = entryRef.current;
          result = await saveJournalEntry({
            periodType,
            periodStart: selectedDate,
            plan: snapshot.plan,
            reflection: snapshot.reflection,
            entryId: currentEntry?.id ?? null,
            expectedUpdatedAt: currentEntry?.updatedAt ?? null,
            overwrite,
          });
        } catch {
          result = {
            status: "error" as const,
            message: "The server could not be reached.",
          };
        }

        if (result.status === "conflict") {
          enqueuedFingerprintsRef.current.delete(fingerprint);
          setServerConflict(result.entry);
          setStatus("conflict");
          return false;
        }
        if (result.status === "error") {
          setSaveError(result.message);
          setStatus("error");
          window.setTimeout(() => {
            enqueuedFingerprintsRef.current.delete(fingerprint);
            setRetryVersion((version) => version + 1);
          }, 3_000);
          return false;
        }

        setEntry(result.entry);
        entryRef.current = result.entry;
        setPersistedDraft(snapshot);
        enqueuedFingerprintsRef.current.delete(fingerprint);
        setStatus(
          sameDraft(currentDraftRef.current, snapshot) ? "saved" : "idle",
        );
        setHistoryRevision((revision) => revision + 1);
        return true;
      });
      saveQueueRef.current = operation.then(() => undefined);
      return operation;
    },
    [periodType, selectedDate],
  );

  useEffect(() => {
    if (!timezoneConfirmed || status === "conflict" || !dirty) return;
    const fingerprint = JSON.stringify(draft);
    if (enqueuedFingerprintsRef.current.has(fingerprint)) return;
    const timer = window.setTimeout(() => void runSave(draft), 750);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, retryVersion, runSave, status, timezoneConfirmed]);

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
    if (
      warnBeforeLeaving &&
      !window.confirm(
        "Your latest journal changes have not been saved. Leave anyway?",
      )
    ) {
      return;
    }
    router.push(
      `/journal?type=${type}&date=${canonicalPeriodStart(type, date)}`,
    );
  }

  function reloadServerVersion() {
    if (!serverConflict) return;
    const serverDraft = draftFromEntry(serverConflict);
    setEntry(serverConflict);
    entryRef.current = serverConflict;
    setDraft(serverDraft);
    setPersistedDraft(serverDraft);
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
    void runSave(draft, true);
  }

  function removeEntry() {
    if (!entry) return;
    startDeleting(async () => {
      const result = await deleteJournalEntry(entry.id, periodType);
      if (result.error) {
        setSaveError(result.error);
        setStatus("error");
        return;
      }
      const empty = draftFromEntry(null);
      setEntry(null);
      setDraft(empty);
      setPersistedDraft(empty);
      setStatus("idle");
      setSaveError(null);
      setImageRevision((revision) => revision + 1);
      setHistoryRevision((revision) => revision + 1);
    });
  }

  const syncEntryVersion = useCallback(
    (updatedAt: string, entryId?: string) => {
      const currentEntry = entryRef.current;
      let nextEntry: InvestmentJournalEntry;
      if (currentEntry) {
        nextEntry = { ...currentEntry, updatedAt };
      } else {
        if (!entryId) return;
        nextEntry = {
          id: entryId,
          periodType,
          periodStart: selectedDate,
          plan: persistedDraft.plan,
          reflection: persistedDraft.reflection,
          updatedAt,
        };
      }
      setEntry(nextEntry);
      entryRef.current = nextEntry;
      setHistoryRevision((revision) => revision + 1);
    },
    [periodType, persistedDraft, selectedDate],
  );

  const prepareForImageMutation = useCallback(async () => {
    if (status === "conflict" || status === "error") return false;
    if (dirty || status === "saving") {
      return runSave(currentDraftRef.current);
    }
    await saveQueueRef.current;
    return true;
  }, [dirty, runSave, status]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Journal</h1>
        <p className="text-muted-foreground">
          Your investment decisions over time.
        </p>
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
          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Journal Period</CardTitle>
                  <CardDescription>
                    {homeTimezone} ·{" "}
                    {timezoneLocked
                      ? "Timezone locked"
                      : "Timezone locks after your first entry"}
                  </CardDescription>
                </div>
                <SaveIndicator status={status} />
              </div>
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Previous ${PERIOD_UNIT[periodType]}`}
                  onClick={() =>
                    navigateTo(
                      periodType,
                      moveJournalPeriod(periodType, selectedDate, -1),
                    )
                  }
                >
                  <RiArrowLeftSLine />
                </Button>
                <Input
                  className="w-auto"
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
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Next ${PERIOD_UNIT[periodType]}`}
                  onClick={() =>
                    navigateTo(
                      periodType,
                      moveJournalPeriod(periodType, selectedDate, 1),
                    )
                  }
                >
                  <RiArrowRightSLine />
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigateTo(
                      periodType,
                      canonicalPeriodStart(
                        periodType,
                        todayInTimezone(homeTimezone),
                      ),
                    )
                  }
                >
                  {periodType === "daily"
                    ? "Today"
                    : periodType === "weekly"
                      ? "This week"
                      : "This month"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
              <CardHeader>
                <CardTitle>Plan</CardTitle>
                <CardDescription>
                  Expectations, actions, risks, and rules.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
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
                        setStatus(status === "conflict" ? "conflict" : "idle");
                        setDraft((current) => ({
                          ...current,
                          plan: event.target.value,
                        }));
                      }}
                    />
                    <FieldDescription>
                      {draft.plan.length.toLocaleString()} / 10,000
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
                </Card>

                <Card>
              <CardHeader>
                <CardTitle>Reflection</CardTitle>
                <CardDescription>
                  What happened, what you learned, and what should change.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel
                      className="sr-only"
                      htmlFor="journal-reflection"
                    >
                      Reflection
                    </FieldLabel>
                    <Textarea
                      id="journal-reflection"
                      className="min-h-72 resize-y"
                      maxLength={MAX_LENGTH}
                      value={draft.reflection}
                      placeholder="What happened and what did you learn?"
                      onChange={(event) => {
                        setStatus(status === "conflict" ? "conflict" : "idle");
                        setDraft((current) => ({
                          ...current,
                          reflection: event.target.value,
                        }));
                      }}
                    />
                    <FieldDescription>
                      {draft.reflection.length.toLocaleString()} / 10,000
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Screenshots</CardTitle>
                  <CardDescription>
                    Paste images while editing or browse for PNG, JPEG, and
                    WebP files up to 4 MiB each.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <JournalImagesSection
                    key={`${periodType}:${selectedDate}:${imageRevision}`}
                    endpoint={imageEndpoint}
                    open
                    disabled={
                      deleting ||
                      status === "error" ||
                      status === "conflict"
                    }
                    beforeMutation={prepareForImageMutation}
                    onEntryVersionChanged={syncEntryVersion}
                    onPendingChange={setImageMutationPending}
                  />
                </CardContent>
              </Card>

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
                <Button variant="outline" onClick={reloadServerVersion}>
                  <RiRefreshLine data-icon="inline-start" />
                  Reload server version
                </Button>
                <Button onClick={overwriteServerVersion}>
                  Overwrite with my edits
                </Button>
              </CardFooter>
            </Card>
              ) : null}

              {entry ? (
                <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={deleting || warnBeforeLeaving}
                  >
                    <RiDeleteBinLine data-icon="inline-start" />
                    Delete entry
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete this Investment Journal Entry?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This explicitly removes the entry for {selectedDate}. This
                      action cannot be undone.
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
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <RecentJournalEntries
                periodType={periodType}
                revision={historyRevision}
                onSelect={(periodStart) => navigateTo(periodType, periodStart)}
              />
              <JournalTransactionContext
                transactions={initialWorkspace.transactions}
                homeTimezone={homeTimezone}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
