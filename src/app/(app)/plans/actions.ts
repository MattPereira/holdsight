"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";

import { authorizeViewedAccount } from "@/lib/auth/authorize";
import type { Plan, PlanInput } from "@/lib/portfolio/plan";
import {
  createPlan as createPlanRecord,
  getUserPlans,
  removePlan,
  updatePlan as updatePlanRecord,
} from "@/lib/portfolio/plans";

export type PlanActionResult = {
  plans: Plan[];
  error: string | null;
};

const SIGNED_OUT_MESSAGE = "You must be signed in to manage Plans.";

/**
 * The account a Plan write may touch, or the signed-out result. A member aiming
 * at the other account gets `forbidden()` — a real 403 — rather than a value,
 * so no caller below can fall back to writing the actor's own account instead
 * (ADR 0005).
 */
async function writableAccount(): Promise<
  { writable: true; userId: string } | { writable: false; result: PlanActionResult }
> {
  const authorization = await authorizeViewedAccount("write");
  if (authorization.status === "forbidden") forbidden();
  if (authorization.status === "unauthenticated") {
    return { writable: false, result: { plans: [], error: SIGNED_OUT_MESSAGE } };
  }

  return { writable: true, userId: authorization.userId };
}

function revalidatePlanPaths(): void {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchanges");
  revalidatePath("/brokerages");
}

export async function deletePlan(planId: string): Promise<PlanActionResult> {
  const account = await writableAccount();
  if (!account.writable) return account.result;

  await removePlan(account.userId, planId);
  const plans = await getUserPlans(account.userId);
  revalidatePlanPaths();
  return { plans, error: null };
}

export type PlanSaveResult = {
  plans: Plan[];
  /** The created/updated Plan, or null when the save failed. */
  plan: Plan | null;
  error: string | null;
};

/**
 * Single entry point for the always-open Plans editor's autosave: creates
 * when `planId` is null, otherwise updates. Returns the saved Plan so the
 * client can keep editing it (subsequent saves become updates).
 */
export async function savePlan(
  planId: string | null,
  input: PlanInput,
): Promise<PlanSaveResult> {
  const account = await writableAccount();
  if (!account.writable) return { ...account.result, plan: null };

  const userId = account.userId;
  const knownIds = planId
    ? null
    : new Set((await getUserPlans(userId)).map((plan) => plan.id));
  const result = planId
    ? await updatePlanRecord(userId, planId, input)
    : await createPlanRecord(userId, input);
  const plans = await getUserPlans(userId);
  if (result.error) return { plans, plan: null, error: result.error };

  const saved = planId
    ? plans.find((plan) => plan.id === planId)
    : plans.find((plan) => !knownIds?.has(plan.id));
  if (!saved) {
    return { plans, plan: null, error: "The saved Plan could not be loaded." };
  }
  revalidatePlanPaths();
  return { plans, plan: saved, error: null };
}
