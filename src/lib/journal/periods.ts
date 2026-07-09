export const JOURNAL_PERIOD_TYPES = ["daily", "weekly", "monthly"] as const;

export type JournalPeriodType = (typeof JOURNAL_PERIOD_TYPES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalPeriodType(value: string): value is JournalPeriodType {
  return JOURNAL_PERIOD_TYPES.some((periodType) => periodType === value);
}

export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseCanonicalJournalPeriod(
  periodType: string,
  periodStart: string,
): { periodType: JournalPeriodType; periodStart: string } | null {
  if (
    !isJournalPeriodType(periodType) ||
    !isCalendarDate(periodStart) ||
    canonicalPeriodStart(periodType, periodStart) !== periodStart
  ) {
    return null;
  }
  return { periodType, periodStart };
}

function toUtcDate(calendarDate: string): Date {
  return new Date(`${calendarDate}T12:00:00Z`);
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function canonicalPeriodStart(
  periodType: JournalPeriodType,
  calendarDate: string,
): string {
  if (!isCalendarDate(calendarDate)) return calendarDate;
  if (periodType === "daily") return calendarDate;

  const date = toUtcDate(calendarDate);
  if (periodType === "weekly") {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  } else {
    date.setUTCDate(1);
  }
  return formatCalendarDate(date);
}

export function moveJournalPeriod(
  periodType: JournalPeriodType,
  periodStart: string,
  amount: number,
): string {
  const date = toUtcDate(canonicalPeriodStart(periodType, periodStart));
  if (periodType === "daily") {
    date.setUTCDate(date.getUTCDate() + amount);
  } else if (periodType === "weekly") {
    date.setUTCDate(date.getUTCDate() + amount * 7);
  } else {
    date.setUTCMonth(date.getUTCMonth() + amount, 1);
  }
  return formatCalendarDate(date);
}

function zonedDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Converts local midnight in an IANA timezone to an absolute UTC instant. */
function localMidnightUtc(calendarDate: string, timeZone: string): Date {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(desiredAsUtc);

  // Refine the timezone offset rather than relying on the process timezone.
  // A second pass handles offset changes crossed by the first adjustment.
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedDateTimeParts(candidate, timeZone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const adjustment = desiredAsUtc - representedAsUtc;
    if (adjustment === 0) return candidate;
    candidate = new Date(candidate.getTime() + adjustment);
  }

  return candidate;
}

export function journalPeriodUtcRange(
  periodType: JournalPeriodType,
  periodStart: string,
  timeZone: string,
): { start: Date; end: Date } {
  const canonicalStart = canonicalPeriodStart(periodType, periodStart);
  const nextStart = moveJournalPeriod(periodType, canonicalStart, 1);
  return {
    start: localMidnightUtc(canonicalStart, timeZone),
    end: localMidnightUtc(nextStart, timeZone),
  };
}

/** Number of buttons in the period-navigation strip, per period type. */
export const JOURNAL_STRIP_SIZE: Record<JournalPeriodType, number> = {
  daily: 7,
  weekly: 6,
  monthly: 6,
};

/** Number of strip buttons kept visible on narrow viewports. */
export const JOURNAL_STRIP_MOBILE_SIZE: Record<JournalPeriodType, number> = {
  daily: 5,
  weekly: 3,
  monthly: 3,
};

/**
 * Dates for the period-navigation strip. Daily always shows the Mon–Sun
 * week containing the selection; weekly/monthly show a window centered on
 * the selection (leaning one extra period into the future).
 */
export function journalStripDates(
  periodType: JournalPeriodType,
  selectedDate: string,
): string[] {
  const canonicalSelected = canonicalPeriodStart(periodType, selectedDate);
  if (periodType === "daily") {
    const weekStart = canonicalPeriodStart("weekly", canonicalSelected);
    return Array.from({ length: JOURNAL_STRIP_SIZE.daily }, (_, index) =>
      moveJournalPeriod("daily", weekStart, index),
    );
  }
  const size = JOURNAL_STRIP_SIZE[periodType];
  const before = Math.floor((size - 1) / 2);
  return Array.from({ length: size }, (_, index) =>
    moveJournalPeriod(periodType, canonicalSelected, index - before),
  );
}

/**
 * Indices to keep visible on narrow viewports: the `count` indices closest
 * to `selectedIndex`. Ties are broken toward the later index, matching the
 * strip's own future-leaning center (see journalStripDates).
 */
export function journalStripMobileVisibleIndices(
  length: number,
  selectedIndex: number,
  count: number,
): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  indices.sort((a, b) => {
    const distanceDiff =
      Math.abs(a - selectedIndex) - Math.abs(b - selectedIndex);
    return distanceDiff !== 0 ? distanceDiff : b - a;
  });
  return indices.slice(0, count).sort((a, b) => a - b);
}
