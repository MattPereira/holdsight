import { describe, expect, it } from "vitest";

import {
  normalizePlanInput,
} from "@/lib/portfolio/plan";

describe("Plan input", () => {
  it("accepts a named Plan with no assigned assets", () => {
    expect(
      normalizePlanInput({
        name: "  Long-term AI  ",
        color: null,
        details: {
          thesis: "  Demand compounds  ",
          invalidation: null,
          entry: null,
          exit: null,
          timeframe: null,
        },
        targetAllocationPercent: 20,
        symbols: [],
      }),
    ).toEqual({
      value: {
        name: "Long-term AI",
        color: null,
        details: {
          thesis: "Demand compounds",
          invalidation: null,
          entry: null,
          exit: null,
          timeframe: null,
        },
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
        details: {
          thesis: null,
          invalidation: null,
          entry: null,
          exit: null,
          timeframe: null,
        },
        targetAllocationPercent: null,
        symbols: [],
      }).error,
    ).toBe("Plan name is required.");
  });

  it("still limits each individual target to 100%", () => {
    const result = normalizePlanInput({
      name: "Long-term AI",
      details: {
        thesis: null,
        invalidation: null,
        entry: null,
        exit: null,
        timeframe: null,
      },
      targetAllocationPercent: 100.01,
      symbols: [],
    });
    expect(result.error).toBe("Target allocation must be between 0% and 100%.");
  });
});
