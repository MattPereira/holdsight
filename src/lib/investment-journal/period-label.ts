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
) {
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
