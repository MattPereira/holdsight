import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewedAccountAuthorization } from "@/lib/auth/authorize";

const authorizeViewedAccount =
  vi.fn<() => Promise<ViewedAccountAuthorization>>();
const plans = vi.hoisted(() => ({
  createPlan: vi.fn(),
  getUserPlans: vi.fn(),
  removePlan: vi.fn(),
  updatePlan: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({
  authorizeViewedAccount: () => authorizeViewedAccount(),
}));
vi.mock("@/lib/portfolio/plans", () => plans);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Next's real `forbidden()` throws an HTTP-access-fallback error the framework
// turns into a 403; the throw is what the action's callers must not swallow.
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

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
  beforeEach(() => {
    authorizeViewedAccount.mockResolvedValue({
      status: "forbidden",
      userId: "admin",
    });
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
    authorizeViewedAccount.mockResolvedValue({
      status: "authorized",
      userId: "member",
    });
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
    authorizeViewedAccount.mockResolvedValue({ status: "unauthenticated" });

    const result = await savePlan(null, PLAN_INPUT);

    expect(plans.createPlan).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});
