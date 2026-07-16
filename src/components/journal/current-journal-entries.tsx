import { RiArrowRightLine } from "@remixicon/react";
import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvestmentJournalEntry } from "@/lib/journal/investment-entry";
import { periodLabel } from "@/lib/journal/period-label";
import type { JournalPeriodType } from "@/lib/journal/periods";

const PERIOD_HEADING: Record<JournalPeriodType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function JournalText({ heading, text }: { heading: string; text: string }) {
  const trimmed = text.trim();
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-muted-foreground text-sm font-medium">{heading}</h3>
      {trimmed.length === 0 ? (
        <p className="text-muted-foreground/60 min-h-48  text-sm italic">
          Nothing yet
        </p>
      ) : (
        <p className="border  min-h-24 rounded-lg p-3 text-sm whitespace-pre-wrap wrap-break-word">
          {trimmed}
        </p>
      )}
    </div>
  );
}

/**
 * Read-only glance at the user's current daily, weekly, and monthly Investment
 * Journal Entries. Renders nothing when none of them have written text; the
 * caller decides which entries qualify (see getCurrentJournalEntries).
 */
export function CurrentJournalEntries({
  entries,
}: {
  entries: InvestmentJournalEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        {entries.map((entry) => (
          <Card key={entry.id} size="sm">
            <CardHeader className="bg-muted/50 -mt-(--card-spacing) items-center border-b pt-(--card-spacing)">
              <CardTitle>{PERIOD_HEADING[entry.periodType]} Journal</CardTitle>
              <CardAction className="row-span-1 self-center">
                <Link
                  href={`/journal?type=${entry.periodType}&date=${entry.periodStart}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
                >
                  {periodLabel(entry.periodType, entry.periodStart)}
                  <RiArrowRightLine className="size-4" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <JournalText heading="Plan" text={entry.plan} />
              <JournalText heading="Notes" text={entry.reflection} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
