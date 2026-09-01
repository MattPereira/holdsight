import { describe, expect, it } from "vitest";

import { planResultSchema } from "@/lib/agents/output-schemas";
import { emptyPlanDetails, getMissingPlanFields } from "@/lib/portfolio/plan";

function planResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "113750a4-a7de-4dc0-8c5c-1b891d122734",
    name: "AI infrastructure",
    symbols: [],
    details: { ...emptyPlanDetails(), thesis: "Compute demand grows" },
    targetAllocationPercent: 25,
    missing: [],
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("Plan agent schema", () => {
  it("carries all six Plan fields", () => {
    const parsed = planResultSchema.parse(planResult());
    expect(Object.keys(parsed.details).sort()).toEqual([
      "adding",
      "entry",
      "invalidation",
      "profit",
      "risk",
      "thesis",
    ]);
  });

  it("accepts the missing-field report the domain actually produces", () => {
    const details = { ...emptyPlanDetails(), thesis: "Compute demand grows" };
    const missing = getMissingPlanFields(details, null);
    expect(() =>
      planResultSchema.parse(
        planResult({ details, missing, targetAllocationPercent: null }),
      ),
    ).not.toThrow();
    expect(missing).toContain("adding");
  });

  it("rejects a field name that is not part of a Plan", () => {
    expect(() => planResultSchema.parse(planResult({ missing: ["exit"] })))
      .toThrow();
  });
});
