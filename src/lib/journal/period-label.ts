import { moveJournalPeriod, type JournalPeriodType } from "./periods";

function formatDate(
  calendarDate: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${calendarDate}T12:00:00Z`));
}

export function periodLabel(
  periodType: JournalPeriodType,
  periodStart: string,
  { includeYear = true }: { includeYear?: boolean } = {},
) {
  if (periodType === "monthly") {
    return formatDate(periodStart, {
      month: "long",
      ...(includeYear ? { year: "numeric" } : {}),
    });
  }
  if (periodType === "weekly") {
    const periodEnd = moveJournalPeriod("daily", periodStart, 6);
    const start = formatDate(periodStart, { month: "short", day: "numeric" });
    const end = formatDate(periodEnd, {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" } : {}),
    });
    return `${start}–${end}`;
  }
  return formatDate(periodStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

/** Compact label for a period-navigation strip button. */
export function journalStripLabel(
  periodType: JournalPeriodType,
  periodStart: string,
): { top: string; bottom?: string } {
  if (periodType === "daily") {
    return {
      top: formatDate(periodStart, { weekday: "short" }),
      bottom: formatDate(periodStart, { day: "numeric" }),
    };
  }
  if (periodType === "weekly") {
    const periodEnd = moveJournalPeriod("daily", periodStart, 6);
    const startMonth = formatDate(periodStart, { month: "short" });
    const endMonth = formatDate(periodEnd, { month: "short" });
    const startDay = formatDate(periodStart, { day: "numeric" });
    const endDay = formatDate(periodEnd, { day: "numeric" });
    const end = startMonth === endMonth ? endDay : `${endMonth} ${endDay}`;
    return { top: `${startMonth} ${startDay}–${end}` };
  }
  return { top: formatDate(periodStart, { month: "short" }) };
}
