import "server-only";

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { planAssets, plans } from "@/db/schema/plans";
import {
  normalizePlanInput,
  type Plan,
  type PlanInput,
} from "@/lib/portfolio/plan";

type PlanTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getUserPlans(userId: string): Promise<Plan[]> {
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      color: plans.color,
      thesis: plans.thesis,
      invalidation: plans.invalidation,
      entry: plans.entry,
      exit: plans.exit,
      targetAllocationPercent: plans.targetAllocationPercent,
      createdAt: plans.createdAt,
      updatedAt: plans.updatedAt,
      symbol: planAssets.symbol,
    })
    .from(plans)
    .leftJoin(planAssets, eq(planAssets.planId, plans.id))
    .where(eq(plans.userId, userId))
    .orderBy(plans.createdAt, planAssets.symbol);

  const byId = new Map<string, Plan>();
  for (const row of rows) {
    let plan = byId.get(row.id);
    if (!plan) {
      plan = {
        id: row.id,
        name: row.name,
        color: row.color,
        details: {
          thesis: row.thesis,
          invalidation: row.invalidation,
          entry: row.entry,
          exit: row.exit,
        },
        targetAllocationPercent: row.targetAllocationPercent,
        updatedAt: row.updatedAt.toISOString(),
        symbols: [],
      };
      byId.set(row.id, plan);
    }
    if (row.symbol) plan.symbols.push(row.symbol);
  }

  return Array.from(byId.values());
}

async function detachSymbols(
  tx: PlanTransaction,
  userId: string,
  symbols: string[],
): Promise<void> {
  if (symbols.length === 0) return;
  await tx
    .delete(planAssets)
    .where(
      and(
        eq(planAssets.userId, userId),
        inArray(planAssets.symbol, symbols),
      ),
    );
}

export async function createPlan(
  userId: string,
  input: PlanInput,
): Promise<{ error: string | null }> {
  const normalized = normalizePlanInput(input);
  if (normalized.error || !normalized.value) return { error: normalized.error };
  const plan = normalized.value;

  return db.transaction(async (tx) => {
    const planId = randomUUID();
    await detachSymbols(tx, userId, plan.symbols);
    await tx.insert(plans).values({
      id: planId,
      userId,
      name: plan.name,
      color: plan.color,
      thesis: plan.details.thesis,
      invalidation: plan.details.invalidation,
      entry: plan.details.entry,
      exit: plan.details.exit,
      targetAllocationPercent: plan.targetAllocationPercent,
    });
    if (plan.symbols.length > 0) {
      await tx.insert(planAssets).values(
        plan.symbols.map((symbol) => ({ planId, userId, symbol })),
      );
    }
    return { error: null };
  });
}

export async function updatePlan(
  userId: string,
  planId: string,
  input: PlanInput,
): Promise<{ error: string | null }> {
  const normalized = normalizePlanInput(input);
  if (normalized.error || !normalized.value) return { error: normalized.error };
  const plan = normalized.value;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .limit(1);
    if (!existing) return { error: "Plan not found." };

    await detachSymbols(tx, userId, plan.symbols);
    await tx
      .delete(planAssets)
      .where(
        and(eq(planAssets.planId, planId), eq(planAssets.userId, userId)),
      );
    await tx
      .update(plans)
      .set({
        name: plan.name,
        color: plan.color,
        thesis: plan.details.thesis,
        invalidation: plan.details.invalidation,
        entry: plan.details.entry,
        exit: plan.details.exit,
        targetAllocationPercent: plan.targetAllocationPercent,
      })
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
    if (plan.symbols.length > 0) {
      await tx.insert(planAssets).values(
        plan.symbols.map((symbol) => ({ planId, userId, symbol })),
      );
    }
    return { error: null };
  });
}

export async function removePlan(userId: string, planId: string): Promise<void> {
  await db
    .delete(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}
