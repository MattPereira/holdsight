import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { planAssets, plans } from "@/db/schema/plans";
import {
  MAX_PLAN_TEXT_LENGTH,
  type PlanDetails,
} from "@/lib/portfolio/plan";

export type AgentPlanPatch = Partial<PlanDetails>;

export type PlanMissingField =
  | keyof PlanDetails
  | "targetAllocationPercent";

export type PlanCompletion = {
  completedFields: number;
  totalFields: 5;
  isComplete: boolean;
  missing: PlanMissingField[];
};

export type AgentPlan = {
  id: string;
  name: string;
  symbols: string[];
  details: PlanDetails;
  targetAllocationPercent: number | null;
  completion: PlanCompletion;
  updatedAt: string;
};

export type AgentPlanListItem = Pick<
  AgentPlan,
  | "id"
  | "name"
  | "symbols"
  | "targetAllocationPercent"
  | "completion"
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

export function getPlanCompletion(
  details: PlanDetails,
  targetAllocationPercent: number | null,
): PlanCompletion {
  const missing: PlanMissingField[] = [];
  let completedFields = 0;
  for (const field of [
    "thesis",
    "invalidation",
    "entry",
    "exit",
  ] as const) {
    if (details[field]?.trim()) completedFields += 1;
    else missing.push(field);
  }
  if (targetAllocationPercent === null) missing.push("targetAllocationPercent");
  else completedFields += 1;
  return {
    completedFields,
    totalFields: 5,
    isComplete: completedFields === 5,
    missing,
  };
}

function serializeAgentPlan(
  plan: {
    id: string;
    name: string;
    thesis: string | null;
    invalidation: string | null;
    entry: string | null;
    exit: string | null;
    targetAllocationPercent: number | null;
    updatedAt: Date;
  },
  symbols: string[],
): AgentPlan {
  const details: PlanDetails = {
    thesis: plan.thesis,
    invalidation: plan.invalidation,
    entry: plan.entry,
    exit: plan.exit,
  };
  return {
    id: plan.id,
    name: plan.name,
    symbols,
    details,
    targetAllocationPercent: plan.targetAllocationPercent,
    completion: getPlanCompletion(details, plan.targetAllocationPercent),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

const planSelection = {
  id: plans.id,
  name: plans.name,
  thesis: plans.thesis,
  invalidation: plans.invalidation,
  entry: plans.entry,
  exit: plans.exit,
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
      completion: serialized.completion,
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
  for (const [field, label] of [
    ["thesis", "Thesis"],
    ["invalidation", "Invalidation"],
    ["entry", "Entry"],
    ["exit", "Exit"],
  ] as const) {
    if (patch[field] !== undefined) {
      updates[field] = normalizeSection(patch[field], label);
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
