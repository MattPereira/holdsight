import { describe, expect, it } from "vitest";
import { journalStripLabel, periodLabel } from "./period-label";

describe("periodLabel", () => {
  it("labels a daily period with weekday, month, day, and year", () => {
    expect(periodLabel("daily", "2026-07-08")).toBe("Wed, Jul 8, 2026");
  });

  it("labels a weekly period as a date range", () => {
    expect(periodLabel("weekly", "2026-07-06")).toBe("Jul 6–Jul 12, 2026");
  });

  it("labels a monthly period with month and year", () => {
    expect(periodLabel("monthly", "2026-07-01")).toBe("July 2026");
  });
});

describe("journalStripLabel", () => {
  it("splits a daily label into weekday and day number", () => {
    expect(journalStripLabel("daily", "2026-07-08")).toEqual({
      top: "Wed",
      bottom: "8",
    });
  });

  it("labels a weekly strip button as a compact same-month range without a year", () => {
    expect(journalStripLabel("weekly", "2026-07-06")).toEqual({
      top: "Jul 6–12",
    });
  });

  it("repeats the month on a weekly strip button when the week crosses month boundaries", () => {
    // Week of 2026-06-29 runs Mon Jun 29 – Sun Jul 5.
    expect(journalStripLabel("weekly", "2026-06-29")).toEqual({
      top: "Jun 29–Jul 5",
    });
  });

  it("labels a monthly strip button with just the month abbreviation, never a year", () => {
    expect(journalStripLabel("monthly", "2026-07-01")).toEqual({
      top: "Jul",
    });
    // Even across a year boundary, no year is shown.
    expect(journalStripLabel("monthly", "2026-01-01")).toEqual({
      top: "Jan",
    });
  });
});
