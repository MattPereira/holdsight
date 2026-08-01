import { describe, expect, it } from "vitest";
import {
  currentJournalPeriods,
  JOURNAL_STRIP_MOBILE_SIZE,
  JOURNAL_STRIP_SIZE,
  journalStripDates,
  journalStripMobileVisibleIndices,
} from "./periods";

describe("currentJournalPeriods", () => {
  it("returns the daily, weekly, and monthly periods containing a mid-week, mid-month day", () => {
    // 2026-07-15 is a Wednesday; its Mon–Sun week starts 2026-07-13.
    expect(currentJournalPeriods("2026-07-15")).toEqual([
      { periodType: "daily", periodStart: "2026-07-15" },
      { periodType: "weekly", periodStart: "2026-07-13" },
      { periodType: "monthly", periodStart: "2026-07-01" },
    ]);
  });

  it("anchors the week to Monday when the day is a Sunday", () => {
    // 2026-07-12 is a Sunday; its week still starts on 2026-07-06.
    expect(currentJournalPeriods("2026-07-12")).toEqual([
      { periodType: "daily", periodStart: "2026-07-12" },
      { periodType: "weekly", periodStart: "2026-07-06" },
      { periodType: "monthly", periodStart: "2026-07-01" },
    ]);
  });

  it("keeps the daily period as the exact day", () => {
    expect(currentJournalPeriods("2026-01-01")).toEqual([
      { periodType: "daily", periodStart: "2026-01-01" },
      { periodType: "weekly", periodStart: "2025-12-29" },
      { periodType: "monthly", periodStart: "2026-01-01" },
    ]);
  });

  it("returns only the requested period types, in the order asked for", () => {
    expect(currentJournalPeriods("2026-07-15", ["daily", "weekly"])).toEqual([
      { periodType: "daily", periodStart: "2026-07-15" },
      { periodType: "weekly", periodStart: "2026-07-13" },
    ]);
    expect(currentJournalPeriods("2026-07-15", ["weekly", "daily"])).toEqual([
      { periodType: "weekly", periodStart: "2026-07-13" },
      { periodType: "daily", periodStart: "2026-07-15" },
    ]);
  });
});

describe("journalStripDates", () => {
  it("returns the Mon–Sun week containing a mid-week daily selection", () => {
    // 2026-07-08 is a Wednesday.
    expect(journalStripDates("daily", "2026-07-08")).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("returns the same week when the selected day is Sunday", () => {
    expect(journalStripDates("daily", "2026-07-12")).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("returns 6 weeks centered on the selected week, 2 before and 3 after", () => {
    const dates = journalStripDates("weekly", "2026-07-06");
    expect(dates).toEqual([
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
    expect(dates[2]).toBe("2026-07-06");
  });

  it("returns 6 months centered on the selected month, 2 before and 3 after", () => {
    const dates = journalStripDates("monthly", "2026-07-01");
    expect(dates).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(dates[2]).toBe("2026-07-01");
  });

  it("canonicalizes a non-canonical selected date before building the window", () => {
    // 2026-07-15 is mid-month; canonical monthly period start is 2026-07-01.
    expect(journalStripDates("monthly", "2026-07-15")).toEqual(
      journalStripDates("monthly", "2026-07-01"),
    );
  });

  it("returns a window of the expected size for each period type", () => {
    expect(journalStripDates("daily", "2026-07-08")).toHaveLength(
      JOURNAL_STRIP_SIZE.daily,
    );
    expect(journalStripDates("weekly", "2026-07-06")).toHaveLength(
      JOURNAL_STRIP_SIZE.weekly,
    );
    expect(journalStripDates("monthly", "2026-07-01")).toHaveLength(
      JOURNAL_STRIP_SIZE.monthly,
    );
  });
});

describe("journalStripMobileVisibleIndices", () => {
  it("keeps the closest indices to a centered weekly/monthly selection", () => {
    // 6-item weekly/monthly strip, selected at index 2 (offsets -2..+3).
    expect(
      journalStripMobileVisibleIndices(
        JOURNAL_STRIP_SIZE.weekly,
        2,
        JOURNAL_STRIP_MOBILE_SIZE.weekly,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("breaks ties toward the later index, preserving the strip's future lean", () => {
    // Selected at index 2; idx1 and idx3 are equidistant. Only one fits in
    // the remaining budget of 1, so the later index (idx3) wins the tie.
    expect(journalStripMobileVisibleIndices(6, 2, 2)).toEqual([2, 3]);
  });

  it("shifts the visible window when the selection sits at the edge of the daily week", () => {
    // 7-item daily strip, Sunday selected at index 6.
    expect(
      journalStripMobileVisibleIndices(
        JOURNAL_STRIP_SIZE.daily,
        6,
        JOURNAL_STRIP_MOBILE_SIZE.daily,
      ),
    ).toEqual([2, 3, 4, 5, 6]);
  });

  it("keeps the closest indices around a centered daily selection", () => {
    // 7-item daily strip, Wednesday selected at index 3.
    expect(
      journalStripMobileVisibleIndices(
        JOURNAL_STRIP_SIZE.daily,
        3,
        JOURNAL_STRIP_MOBILE_SIZE.daily,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns indices in ascending order", () => {
    const indices = journalStripMobileVisibleIndices(6, 5, 4);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
