import { beforeEach, describe, expect, it, vi } from "vitest";

const writableViewedAccountId = vi.fn<() => Promise<string | null>>();
const plans = vi.hoisted(() => ({
  createPlan: vi.fn(),
  getUserPlans: vi.fn(),
  removePlan: vi.fn(),
  updatePlan: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({
  writableViewedAccountId: () => writableViewedAccountId(),
}));
vi.mock("@/lib/portfolio/plans", () => plans);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { deletePlan, savePlan } = await import("@/app/(app)/plans/actions");

const PLAN_INPUT = {
  name: "Future BTC",
  color: null,
  details: {},
  targetAllocationPercent: null,
  symbols: [],
} as unknown as Parameters<typeof savePlan>[1];

beforeEach(() => {
  vi.clearAllMocks();
  plans.getUserPlans.mockResolvedValue([]);
  plans.createPlan.mockResolvedValue({ error: null });
  plans.updatePlan.mockResolvedValue({ error: null });
});

describe("Plan writes against a foreign account", () => {
  // A refused write never returns: the seam answers 403 via `forbidden()`.
  beforeEach(() => {
    writableViewedAccountId.mockRejectedValue(new Error("FORBIDDEN"));
  });

  it("refuses to delete", async () => {
    await expect(deletePlan("plan-1")).rejects.toThrow("FORBIDDEN");

    expect(plans.removePlan).not.toHaveBeenCalled();
  });

  // The denied account is never swapped for the actor's own, which would
  // silently write a Plan into the wrong portfolio.
  it("refuses to save without falling back to the actor's account", async () => {
    await expect(savePlan(null, PLAN_INPUT)).rejects.toThrow("FORBIDDEN");

    expect(plans.createPlan).not.toHaveBeenCalled();
    expect(plans.updatePlan).not.toHaveBeenCalled();
  });
});

describe("Plan writes the policy allows", () => {
  beforeEach(() => {
    writableViewedAccountId.mockResolvedValue("member");
  });

  it("deletes against the viewed account", async () => {
    await deletePlan("plan-1");

    expect(plans.removePlan).toHaveBeenCalledWith("member", "plan-1");
  });

  it("updates against the viewed account", async () => {
    plans.getUserPlans.mockResolvedValue([{ id: "plan-1" }]);

    const result = await savePlan("plan-1", PLAN_INPUT);

    expect(plans.updatePlan).toHaveBeenCalledWith("member", "plan-1", PLAN_INPUT);
    expect(result.error).toBeNull();
  });
});

describe("Plan writes without a session", () => {
  it("refuses to save", async () => {
    writableViewedAccountId.mockResolvedValue(null);

    const result = await savePlan(null, PLAN_INPUT);

    expect(plans.createPlan).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});
