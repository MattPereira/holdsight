"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RiImageLine } from "@remixicon/react";

import { getRecentJournalEntries } from "@/app/(app)/journal/actions";
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
import type {
  RecentJournalEntriesCursor,
  RecentJournalEntry,
} from "@/lib/investment-journal/journal";
import {
  moveJournalPeriod,
  type JournalPeriodType,
} from "@/lib/investment-journal/periods";

function formatDate(calendarDate: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(
    new Date(`${calendarDate}T12:00:00Z`),
  );
}

function periodLabel(periodType: JournalPeriodType, periodStart: string) {
  if (periodType === "monthly") {
    return formatDate(periodStart, { month: "long", year: "numeric" });
  }
  if (periodType === "weekly") {
    const periodEnd = moveJournalPeriod("daily", periodStart, 6);
    const start = formatDate(periodStart, { month: "short", day: "numeric" });
    const end = formatDate(periodEnd, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${start}–${end}`;
  }
  return formatDate(periodStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RecentJournalEntries({
  periodType,
  revision,
  onSelect,
}: {
  periodType: JournalPeriodType;
  revision: number;
  onSelect: (periodStart: string) => void;
}) {
  const [entries, setEntries] = useState<RecentJournalEntry[]>([]);
  const [cursor, setCursor] = useState<RecentJournalEntriesCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const page = await getRecentJournalEntries(periodType);
      if (requestId !== requestIdRef.current) return;
      setEntries(page.entries);
      setCursor(page.nextCursor);
      setError(false);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [periodType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFirstPage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadFirstPage, revision]);

  async function loadMore() {
    if (!cursor) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const page = await getRecentJournalEntries(periodType, cursor);
      if (requestId !== requestIdRef.current) return;
      setEntries((current) => [...current, ...page.entries]);
      setCursor(page.nextCursor);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent entries</CardTitle>
        <CardDescription>
          Your most recently updated {periodType} Journal Periods.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length ? (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 flex w-full flex-col gap-2 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-3"
                onClick={() => onSelect(entry.periodStart)}
              >
                <span className="font-medium">
                  {periodLabel(periodType, entry.periodStart)}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {entry.hasPlan ? <Badge variant="secondary">Plan</Badge> : null}
                  {entry.hasReflection ? (
                    <Badge variant="secondary">Reflection</Badge>
                  ) : null}
                  {entry.hasImages ? (
                    <Badge variant="secondary">
                      <RiImageLine data-icon="inline-start" />
                      Images
                    </Badge>
                  ) : null}
                  {!entry.hasPlan && !entry.hasReflection && !entry.hasImages ? (
                    <Badge variant="outline">Empty entry</Badge>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : loading ? (
          <p className="text-muted-foreground text-sm">Loading entries…</p>
        ) : error ? (
          <p className="text-destructive text-sm">Recent entries could not be loaded.</p>
        ) : (
          <p className="text-muted-foreground text-sm">No {periodType} entries yet.</p>
        )}
      </CardContent>
      {cursor || error ? (
        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={error && !entries.length ? loadFirstPage : loadMore}
          >
            {loading ? "Loading…" : error && !entries.length ? "Try again" : "View more"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
