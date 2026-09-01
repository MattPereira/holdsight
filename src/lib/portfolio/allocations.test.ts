import { describe, expect, it } from "vitest";

import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import { emptyPlanDetails, type Plan } from "@/lib/portfolio/plan";

describe("buildPortfolioAllocations", () => {
  it("groups assigned holdings under their Plan", () => {
    const plan: Plan = {
      id: "plan-1",
      name: "AI infrastructure",
      color: "var(--chart-2)",
      details: { ...emptyPlanDetails(), thesis: "Compute demand grows" },
      targetAllocationPercent: 30,
      updatedAt: "2026-08-30T00:00:00.000Z",
      symbols: ["NVDA", "TSM"],
    };

    const result = buildPortfolioAllocations({
      grandTotalValueUsd: 1_000,
      totals: [
        { key: "nvda", symbol: "NVDA", amount: 1, valueUsd: 200 },
        { key: "tsm", symbol: "TSM", amount: 1, valueUsd: 100 },
        { key: "cash", symbol: "USD", amount: 700, valueUsd: 700 },
      ],
      plans: [plan],
      minimumAssetValueUsd: 0,
    });

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "plan:plan-1",
          label: "AI infrastructure",
          valueUsd: 300,
          weight: 0.3,
          isPlan: true,
          planId: "plan-1",
          planDetails: plan.details,
          targetAllocationPercent: 30,
        }),
      ]),
    );
  });
});
