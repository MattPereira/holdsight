import { describe, expect, it } from "vitest";

import {
  emptyPlanDetails,
  getMissingPlanFields,
  normalizePlanInput,
  PLAN_FIELDS,
} from "@/lib/portfolio/plan";

describe("Plan input", () => {
  it("accepts a named Plan with no assigned assets", () => {
    expect(
      normalizePlanInput({
        name: "  Long-term AI  ",
        color: null,
        details: { ...emptyPlanDetails(), thesis: "  Demand compounds  " },
        targetAllocationPercent: 20,
        symbols: [],
      }),
    ).toEqual({
      value: {
        name: "Long-term AI",
        color: null,
        details: { ...emptyPlanDetails(), thesis: "Demand compounds" },
        targetAllocationPercent: 20,
        symbols: [],
      },
      error: null,
    });
  });

  it("requires a Plan name", () => {
    expect(
      normalizePlanInput({
        name: "  ",
        color: null,
        details: emptyPlanDetails(),
        targetAllocationPercent: null,
        symbols: [],
      }).error,
    ).toBe("Plan name is required.");
  });

  it("still limits each individual target to 100%", () => {
    const result = normalizePlanInput({
      name: "Long-term AI",
      details: emptyPlanDetails(),
      targetAllocationPercent: 100.01,
      symbols: [],
    });
    expect(result.error).toBe("Target allocation must be between 0% and 100%.");
  });

  it("reports the field by its label when it is too long", () => {
    const result = normalizePlanInput({
      name: "Long-term AI",
      details: { ...emptyPlanDetails(), adding: "x".repeat(10_001) },
      targetAllocationPercent: null,
      symbols: [],
    });
    expect(result.error).toBe("Adding must be 10,000 characters or fewer.");
  });
});

describe("Plan fields", () => {
  it("orders the six fields so Risk and Profit are read before Entry and Adding", () => {
    expect(PLAN_FIELDS.map((field) => field.key)).toEqual([
      "thesis",
      "invalidation",
      "risk",
      "profit",
      "entry",
      "adding",
    ]);
  });
});

describe("Missing Plan fields", () => {
  it("reports every field of a blank Plan", () => {
    expect(getMissingPlanFields(emptyPlanDetails(), null)).toEqual([
      "thesis",
      "invalidation",
      "risk",
      "profit",
      "entry",
      "adding",
      "targetAllocationPercent",
    ]);
  });

  it("reports nothing when every field is answered", () => {
    const details = {
      thesis: "Attention and volume",
      invalidation: "A perp competitor takes share",
      risk: "20% of the position value, then I am out entirely",
      profit: "Euphoria above the blue line",
      entry: "A weekly close above the blue line",
      adding: "In thirds, on each weekly close above the blue line",
    };
    expect(getMissingPlanFields(details, 50)).toEqual([]);
  });

  it("treats whitespace as unanswered", () => {
    const details = { ...emptyPlanDetails(), thesis: "   \n  " };
    expect(getMissingPlanFields(details, 50)).toContain("thesis");
  });

  it("reports the target allocation separately from the text fields", () => {
    const details = {
      thesis: "a",
      invalidation: "b",
      risk: "c",
      profit: "d",
      entry: "e",
      adding: "f",
    };
    expect(getMissingPlanFields(details, null)).toEqual([
      "targetAllocationPercent",
    ]);
  });
});
