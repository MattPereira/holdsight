import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { planAssets, planDetailColumns, plans } from "@/db/schema/plans";
import {
  emptyPlanDetails,
  getMissingPlanFields,
  MAX_PLAN_TEXT_LENGTH,
  PLAN_FIELDS,
  type PlanDetails,
  type PlanMissingField,
} from "@/lib/portfolio/plan";

export type AgentPlanPatch = Partial<PlanDetails>;

export type AgentPlan = {
  id: string;
  name: string;
  symbols: string[];
  details: PlanDetails;
  targetAllocationPercent: number | null;
  missing: PlanMissingField[];
  updatedAt: string;
};

export type AgentPlanListItem = Pick<
  AgentPlan,
  | "id"
  | "name"
  | "symbols"
  | "targetAllocationPercent"
  | "missing"
  | "updatedAt"
>;

export class AgentPlanError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid_input" | "not_found",
  ) {
    super(message);
  }
}

function normalizeSection(value: string | null, label: string): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_PLAN_TEXT_LENGTH) {
    throw new AgentPlanError(
      `${label} must be ${MAX_PLAN_TEXT_LENGTH.toLocaleString()} characters or fewer.`,
      "invalid_input",
    );
  }
  return trimmed;
}

function serializeAgentPlan(
  plan: PlanDetails & {
    id: string;
    name: string;
    targetAllocationPercent: number | null;
    updatedAt: Date;
  },
  symbols: string[],
): AgentPlan {
  const details = emptyPlanDetails();
  for (const field of PLAN_FIELDS) details[field.key] = plan[field.key];
  return {
    id: plan.id,
    name: plan.name,
    symbols,
    details,
    targetAllocationPercent: plan.targetAllocationPercent,
    missing: getMissingPlanFields(details, plan.targetAllocationPercent),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

const planSelection = {
  id: plans.id,
  name: plans.name,
  ...planDetailColumns,
  targetAllocationPercent: plans.targetAllocationPercent,
  updatedAt: plans.updatedAt,
};

export async function listPlansForAgent(
  userId: string,
): Promise<AgentPlanListItem[]> {
  const rows = await db
    .select({
      ...planSelection,
      createdAt: plans.createdAt,
      symbol: planAssets.symbol,
    })
    .from(plans)
    .leftJoin(planAssets, eq(planAssets.planId, plans.id))
    .where(eq(plans.userId, userId))
    .orderBy(plans.createdAt, planAssets.symbol);

  const byId = new Map<
    string,
    { plan: (typeof rows)[number]; symbols: string[] }
  >();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (existing) {
      if (row.symbol) existing.symbols.push(row.symbol);
    } else {
      byId.set(row.id, {
        plan: row,
        symbols: row.symbol ? [row.symbol] : [],
      });
    }
  }

  return Array.from(byId.values(), ({ plan, symbols }) => {
    const serialized = serializeAgentPlan(plan, symbols);
    return {
      id: serialized.id,
      name: serialized.name,
      symbols: serialized.symbols,
      targetAllocationPercent: serialized.targetAllocationPercent,
      missing: serialized.missing,
      updatedAt: serialized.updatedAt,
    };
  });
}

export async function getPlanForAgent(
  userId: string,
  planId: string,
): Promise<AgentPlan> {
  const rows = await db
    .select({ ...planSelection, symbol: planAssets.symbol })
    .from(plans)
    .leftJoin(planAssets, eq(planAssets.planId, plans.id))
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
  const [plan] = rows;
  if (!plan) {
    throw new AgentPlanError(
      "Plan not found for the authenticated user.",
      "not_found",
    );
  }
  return serializeAgentPlan(
    plan,
    rows.flatMap((row) => (row.symbol ? [row.symbol] : [])),
  );
}

export async function updatePlanForAgent(
  userId: string,
  planId: string,
  expectedUpdatedAt: string,
  patch: AgentPlanPatch,
): Promise<AgentPlan> {
  const current = await getPlanForAgent(userId, planId);
  const updates: Partial<PlanDetails> = {};
  for (const { key, label } of PLAN_FIELDS) {
    if (patch[key] !== undefined) {
      updates[key] = normalizeSection(patch[key], label);
    }
  }
  if (Object.keys(updates).length === 0) {
    throw new AgentPlanError(
      "Provide at least one Plan field to update.",
      "invalid_input",
    );
  }

  const expectedTimestamp = new Date(expectedUpdatedAt);
  const updatedAt = new Date(
    Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
  );
  const [updated] = await db
    .update(plans)
    .set({ ...updates, updatedAt })
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.userId, userId),
        eq(plans.updatedAt, expectedTimestamp),
      ),
    )
    .returning(planSelection);
  if (!updated) {
    throw new AgentPlanError(
      `The Plan changed after it was read (current updatedAt: ${current.updatedAt}). Read it again before retrying.`,
      "conflict",
    );
  }
  return serializeAgentPlan(updated, current.symbols);
}
