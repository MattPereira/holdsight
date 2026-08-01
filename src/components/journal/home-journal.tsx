"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RiArrowRightLine } from "@remixicon/react";

import { saveJournalEntry } from "@/app/(app)/journal/actions";
import {
  JournalEntryFields,
  type JournalDraft,
} from "@/components/journal/journal-entry-fields";
import { SaveIndicator } from "@/components/journal/save-indicator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  InvestmentJournalEntry,
  JournalSlot,
} from "@/lib/journal/investment-entry";
import { periodLabel } from "@/lib/journal/period-label";
import {
  canonicalPeriodStart,
  todayInTimezone,
  type JournalPeriodType,
} from "@/lib/journal/periods";
import { useAutosaveEntry, type SaveStatus } from "@/lib/journal/use-autosave-entry";
import { useUnsavedChangesGuard } from "@/lib/journal/use-unsaved-changes-guard";
import { cn } from "@/lib/utils";

const UNSAVED_CHANGES_MESSAGE =
  "Your latest journal changes have not been saved. Leave anyway?";

const PERIOD_TAB_LABEL: Record<JournalPeriodType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function draftFromEntry(entry: InvestmentJournalEntry | null): JournalDraft {
  return { plan: entry?.plan ?? "", reflection: entry?.reflection ?? "" };
}

function sameDraft(left: JournalDraft, right: JournalDraft): boolean {
  return left.plan === right.plan && left.reflection === right.reflection;
}

function slotKey(slot: JournalSlot): string {
  return `${slot.periodType}:${slot.periodStart}`;
}

function shouldWarnFor(status: SaveStatus, dirty: boolean): boolean {
  return (
    dirty || status === "saving" || status === "error" || status === "conflict"
  );
}

function HomeJournalSlot({
  slot,
  hidden,
  onStatusChange,
  registerFlush,
}: {
  slot: JournalSlot;
  hidden: boolean;
  onStatusChange: (
    key: string,
    state: { status: SaveStatus; shouldWarn: boolean } | null,
  ) => void;
  registerFlush: (key: string, flush: () => Promise<boolean>) => () => void;
}) {
  const key = slotKey(slot);
  const autosave = useAutosaveEntry<JournalDraft, InvestmentJournalEntry>({
    key,
    initialEntry: slot.entry,
    draftFromEntry,
    sameDraft,
    save: (snapshot, currentEntry, overwrite) =>
      saveJournalEntry({
        periodType: slot.periodType,
        periodStart: slot.periodStart,
        plan: snapshot.plan,
        reflection: snapshot.reflection,
        entryId: currentEntry?.id ?? null,
        expectedUpdatedAt: currentEntry?.updatedAt ?? null,
        overwrite,
      }),
  });
  const { draft, status, saveError, dirty, flushBeforeMutation } = autosave;

  // Status is reported upward because the header row is shared: it shows the
  // save indicator for whichever period is selected. The unsaved-changes guard
  // is hoisted for a different reason — one document-level listener for both
  // periods, or a single sidebar click would raise two confirmation dialogs.
  const shouldWarn = shouldWarnFor(status, dirty);
  useEffect(() => {
    onStatusChange(key, { status, shouldWarn });
  }, [key, onStatusChange, shouldWarn, status]);
  useEffect(() => {
    return () => onStatusChange(key, null);
  }, [key, onStatusChange]);

  useEffect(
    () => registerFlush(key, flushBeforeMutation),
    [flushBeforeMutation, key, registerFlush],
  );

  // Kept mounted while another period is selected: unmounting would discard an
  // unsaved draft and abandon any save still in flight.
  return (
    <div className={cn(hidden && "hidden")}>
      <JournalEntryFields
        idPrefix={`home-${slot.periodType}`}
        draft={draft}
        onDraftChange={autosave.setDraft}
        status={status}
        saveError={saveError}
        onReloadServerVersion={autosave.reloadServerVersion}
        onOverwriteServerVersion={autosave.overwriteServerVersion}
        textareaClassName="min-h-40"
        headingClassName="text-sm"
      />
    </div>
  );
}

/**
 * The current Journal Periods, editable in place on the Portfolio page, one at
 * a time. The dedicated Journal page still owns history, monthly entries,
 * screenshots, trades, and deletion — this is only the fast path for writing
 * today's and this week's Plan and Notes.
 */
export function HomeJournal({
  homeTimezone,
  slots,
}: {
  homeTimezone: string | null;
  slots: JournalSlot[];
}) {
  const router = useRouter();
  const [activePeriod, setActivePeriod] = useState<JournalPeriodType>(
    slots[0]?.periodType ?? "daily",
  );
  const [slotStates, setSlotStates] = useState<
    Record<string, { status: SaveStatus; shouldWarn: boolean }>
  >({});
  const flushersRef = useRef(new Map<string, () => Promise<boolean>>());
  const slotsRef = useRef(slots);
  const attemptedRolloverRef = useRef<string | null>(null);

  useEffect(() => {
    slotsRef.current = slots;
  });

  const onStatusChange = useCallback(
    (
      key: string,
      state: { status: SaveStatus; shouldWarn: boolean } | null,
    ) => {
      setSlotStates((current) => {
        if (state === null) {
          if (!(key in current)) return current;
          const next = { ...current };
          delete next[key];
          return next;
        }
        const existing = current[key];
        if (
          existing?.status === state.status &&
          existing?.shouldWarn === state.shouldWarn
        ) {
          return current;
        }
        return { ...current, [key]: state };
      });
    },
    [],
  );

  const registerFlush = useCallback(
    (key: string, flush: () => Promise<boolean>) => {
      flushersRef.current.set(key, flush);
      return () => {
        flushersRef.current.delete(key);
      };
    },
    [],
  );

  useUnsavedChangesGuard(
    Object.values(slotStates).some((state) => state.shouldWarn),
    UNSAVED_CHANGES_MESSAGE,
  );

  // The periods were resolved on the server at request time. A tab left open
  // past midnight (or past Sunday) would keep showing the stale period while
  // writing into yesterday's entry, so re-resolve them whenever the tab comes
  // back and pull fresh slots from the server if the day has rolled over.
  const renderedKey = slots.map(slotKey).join("|");
  useEffect(() => {
    const timezone = homeTimezone;
    if (!timezone) return;

    const checkForRollover = () => {
      if (document.visibilityState !== "visible") return;
      const today = todayInTimezone(timezone);
      const liveKey = slotsRef.current
        .map(
          (slot) =>
            `${slot.periodType}:${canonicalPeriodStart(slot.periodType, today)}`,
        )
        .join("|");
      if (liveKey === renderedKey) {
        attemptedRolloverRef.current = null;
        return;
      }
      // One attempt per target period: if the refresh doesn't move us (a
      // server/client clock disagreement, say), don't spin on every focus.
      if (attemptedRolloverRef.current === liveKey) return;
      attemptedRolloverRef.current = liveKey;

      void (async () => {
        // Land any in-flight draft on the period it was written for before the
        // refresh remounts these fields against the new period.
        for (const flush of flushersRef.current.values()) await flush();
        router.refresh();
      })();
    };

    document.addEventListener("visibilitychange", checkForRollover);
    window.addEventListener("focus", checkForRollover);
    return () => {
      document.removeEventListener("visibilitychange", checkForRollover);
      window.removeEventListener("focus", checkForRollover);
    };
  }, [homeTimezone, renderedKey, router]);

  if (!homeTimezone) {
    return (
      <Link
        href="/journal"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm transition-colors"
      >
        Set up your journal
        <RiArrowRightLine className="size-4" />
      </Link>
    );
  }

  const activeSlot =
    slots.find((slot) => slot.periodType === activePeriod) ?? slots[0];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">Journal</h2>
        <Tabs
          value={activePeriod}
          onValueChange={(value) =>
            setActivePeriod(value as JournalPeriodType)
          }
        >
          <TabsList
            aria-label="Journal Period type"
            className="grid grid-cols-2"
          >
            {slots.map((slot) => (
              <TabsTrigger key={slot.periodType} value={slot.periodType}>
                {PERIOD_TAB_LABEL[slot.periodType]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {activeSlot ? (
          <>
            <Link
              href={`/journal?type=${activeSlot.periodType}&date=${activeSlot.periodStart}`}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {periodLabel(activeSlot.periodType, activeSlot.periodStart, {
                includeYear: false,
              })}
            </Link>
            <div className="ml-auto">
              <SaveIndicator
                status={slotStates[slotKey(activeSlot)]?.status ?? "idle"}
              />
            </div>
          </>
        ) : null}
      </div>

      {slots.map((slot) => (
        <HomeJournalSlot
          key={slotKey(slot)}
          slot={slot}
          hidden={slot.periodType !== activeSlot?.periodType}
          onStatusChange={onStatusChange}
          registerFlush={registerFlush}
        />
      ))}
    </section>
  );
}
