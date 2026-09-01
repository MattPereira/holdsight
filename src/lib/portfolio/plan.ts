import { ASSET_CHART_COLORS } from "@/lib/portfolio/asset-totals";

export const MAX_PLAN_NAME_LENGTH = 40;
export const MAX_PLAN_TEXT_LENGTH = 10_000;

/**
 * The six commitments a Plan asks you to make before taking exposure, in the
 * order they are read. Exit rules sit above entry rules on purpose: what you
 * are willing to lose is decided before how you get in.
 *
 * Two boundaries carry the weight here. Invalidation is the thesis being
 * wrong; Risk is how much you will lose before closing the position entirely.
 * Entry is the first buy; Adding is every buy after it.
 *
 * This list is the single source of truth for the fields — the editor labels,
 * the agent tool descriptions, and the missing-field report all read from it.
 */
export const PLAN_FIELDS = [
  {
    key: "thesis",
    label: "Thesis",
    prompt: "Why do I own this?",
  },
  {
    key: "invalidation",
    label: "Invalidation",
    prompt: "What would prove the thesis wrong?",
  },
  {
    key: "risk",
    label: "Risk",
    prompt: "How much am I willing to lose before I give up on this trade?",
  },
  {
    key: "profit",
    label: "Profit",
    prompt: "What makes me take profit?",
  },
  {
    key: "entry",
    label: "Entry",
    prompt: "What has to be true before I buy?",
  },
  {
    key: "adding",
    label: "Adding",
    prompt: "What has to be true before I buy more, and how much each time?",
  },
] as const;

export type PlanField = (typeof PLAN_FIELDS)[number]["key"];

export type PlanDetails = Record<PlanField, string | null>;

export function emptyPlanDetails(): PlanDetails {
  return {
    thesis: null,
    invalidation: null,
    risk: null,
    profit: null,
    entry: null,
    adding: null,
  };
}

export type PlanMissingField = PlanField | "targetAllocationPercent";

/**
 * Which commitments a Plan has not made yet. This is a presence check, not a
 * quality one — an answered field can still be mush.
 */
export function getMissingPlanFields(
  details: PlanDetails,
  targetAllocationPercent: number | null,
): PlanMissingField[] {
  const missing: PlanMissingField[] = PLAN_FIELDS.flatMap((field) =>
    details[field.key]?.trim() ? [] : [field.key],
  );
  if (targetAllocationPercent === null) missing.push("targetAllocationPercent");
  return missing;
}

export type Plan = {
  id: string;
  name: string;
  color: string | null;
  details: PlanDetails;
  targetAllocationPercent: number | null;
  updatedAt: string;
  symbols: string[];
};

export type PlanInput = {
  name: string;
  color?: string | null;
  details: PlanDetails;
  targetAllocationPercent?: number | null;
  symbols: string[];
};

export type NormalizedPlanInput = {
  name: string;
  color: string | null;
  details: PlanDetails;
  targetAllocationPercent: number | null;
  symbols: string[];
};

function normalizeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of symbols) {
    const symbol = raw.trim();
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(symbol);
  }
  return result;
}

function normalizeText(
  value: unknown,
  label: string,
): { value: string | null; error: string | null } {
  if (value !== null && value !== undefined && typeof value !== "string") {
    return { value: null, error: `${label} must be text.` };
  }
  const trimmed = value?.trim();
  if (!trimmed) return { value: null, error: null };
  if (trimmed.length > MAX_PLAN_TEXT_LENGTH) {
    return {
      value: null,
      error: `${label} must be ${MAX_PLAN_TEXT_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }
  return { value: trimmed, error: null };
}

function normalizeTargetAllocation(
  target: number | null | undefined,
): { value: number | null; error: string | null } {
  if (target === null || target === undefined) {
    return { value: null, error: null };
  }
  if (!Number.isFinite(target) || target < 0 || target > 100) {
    return { value: null, error: "Target allocation must be between 0% and 100%." };
  }
  const rounded = Math.round(target * 100) / 100;
  if (Math.abs(target - rounded) > Number.EPSILON) {
    return {
      value: null,
      error: "Target allocation can have at most two decimal places.",
    };
  }
  return { value: rounded, error: null };
}

export function normalizePlanInput(
  input: PlanInput,
): { value: NormalizedPlanInput | null; error: string | null } {
  const name = input.name.trim();
  if (!name) return { value: null, error: "Plan name is required." };
  if (name.length > MAX_PLAN_NAME_LENGTH) {
    return {
      value: null,
      error: `Plan name must be ${MAX_PLAN_NAME_LENGTH} characters or fewer.`,
    };
  }

  const details = emptyPlanDetails();
  for (const field of PLAN_FIELDS) {
    const section = normalizeText(input.details[field.key], field.label);
    if (section.error) return { value: null, error: section.error };
    details[field.key] = section.value;
  }

  const target = normalizeTargetAllocation(input.targetAllocationPercent);
  if (target.error) return { value: null, error: target.error };

  const requestedColor = input.color?.trim() || null;
  const color =
    requestedColor && ASSET_CHART_COLORS.includes(requestedColor)
      ? requestedColor
      : null;

  return {
    value: {
      name,
      color,
      details,
      targetAllocationPercent: target.value,
      symbols: normalizeSymbols(input.symbols),
    },
    error: null,
  };
}
