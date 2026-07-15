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
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};

function JournalText({ heading, text }: { heading: string; text: string }) {
  if (text.trim().length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {heading}
      </h3>
      <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
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
      <h2 className="text-lg font-semibold">Journal</h2>
      <div className="flex flex-col gap-4">
        {entries.map((entry) => (
          <Card key={entry.id} size="sm">
            <CardHeader className="border-b">
              <CardTitle className="flex flex-wrap items-baseline gap-x-2">
                <span>{PERIOD_HEADING[entry.periodType]}</span>
                <span className="text-muted-foreground text-sm font-normal">
                  <span aria-hidden className="mr-2">
                    ·
                  </span>
                  {periodLabel(entry.periodType, entry.periodStart)}
                </span>
              </CardTitle>
              <CardAction>
                <Link
                  href={`/journal?type=${entry.periodType}&date=${entry.periodStart}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
                >
                  Edit in journal
                  <RiArrowRightLine className="size-4" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <JournalText heading="Plan" text={entry.plan} />
              <JournalText heading="Reflection" text={entry.reflection} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
