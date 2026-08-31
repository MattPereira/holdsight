"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/auth/session";
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

async function unauthorizedResult(): Promise<PlanActionResult> {
  return { plans: [], error: "You must be signed in to manage Plans." };
}

function revalidatePlanPaths(): void {
  revalidatePath("/");
  revalidatePath("/plans");
  revalidatePath("/wallets");
  revalidatePath("/exchanges");
  revalidatePath("/brokerages");
}

export async function createPlan(input: PlanInput): Promise<PlanActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResult();
  const result = await createPlanRecord(userId, input);
  const plans = await getUserPlans(userId);
  if (result.error) return { plans, error: result.error };
  revalidatePlanPaths();
  return { plans, error: null };
}

export async function updatePlan(
  planId: string,
  input: PlanInput,
): Promise<PlanActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResult();
  const result = await updatePlanRecord(userId, planId, input);
  const plans = await getUserPlans(userId);
  if (result.error) return { plans, error: result.error };
  revalidatePlanPaths();
  return { plans, error: null };
}

export async function deletePlan(planId: string): Promise<PlanActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResult();
  await removePlan(userId, planId);
  const plans = await getUserPlans(userId);
  revalidatePlanPaths();
  return { plans, error: null };
}
