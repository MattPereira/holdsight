import { describe, expect, it } from "vitest";

import { planResultSchema } from "@/lib/agents/output-schemas";

describe("Plan agent schema", () => {
  it("accepts the renamed Plan contract", () => {
    expect(
      planResultSchema.parse({
        id: "113750a4-a7de-4dc0-8c5c-1b891d122734",
        name: "AI infrastructure",
        symbols: [],
        details: {
          thesis: "Compute demand grows",
          invalidation: null,
          entry: null,
          exit: null,
          timeframe: "Five years",
        },
        targetAllocationPercent: 25,
        completion: {
          completedFields: 3,
          totalFields: 6,
          isComplete: false,
          missing: ["invalidation", "entry", "exit"],
        },
        updatedAt: "2026-08-30T00:00:00.000Z",
      }),
    ).toMatchObject({
      name: "AI infrastructure",
      targetAllocationPercent: 25,
    });
  });
});
