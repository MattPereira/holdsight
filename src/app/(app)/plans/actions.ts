"use server";

import { revalidatePath } from "next/cache";

import { authorizedViewedAccountId } from "@/lib/auth/authorize";
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

function revalidatePlanPaths(): void {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchanges");
  revalidatePath("/brokerages");
}

export async function deletePlan(planId: string): Promise<PlanActionResult> {
  const userId = await authorizedViewedAccountId("write");
  if (!userId) return { plans: [], error: SIGNED_OUT_MESSAGE };

  await removePlan(userId, planId);
  const plans = await getUserPlans(userId);
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
  const userId = await authorizedViewedAccountId("write");
  if (!userId) return { plans: [], plan: null, error: SIGNED_OUT_MESSAGE };

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
