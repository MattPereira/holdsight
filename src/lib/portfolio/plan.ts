import { ASSET_CHART_COLORS } from "@/lib/portfolio/asset-totals";

export const MAX_PLAN_NAME_LENGTH = 40;
export const MAX_PLAN_TEXT_LENGTH = 10_000;

/**
 * Field meanings and boundaries live in CONTEXT.md. Order is load-bearing:
 * Risk and Profit are read before Entry and Adding.
 */
export const PLAN_FIELDS = [
  {
    key: "thesis",
    label: "Thesis",
    prompt: "Reason to believe price will move",
  },
  {
    key: "invalidation",
    label: "Invalidation",
    prompt: "Situation that would prove thesis wrong",
  },
  {
    key: "risk",
    label: "Risk",
    prompt: "Define exactly how much you are willing to lose",
  },
  {
    key: "profit",
    label: "Profit",
    prompt: "When and what increment to sell for gains",
  },
  {
    key: "entry",
    label: "Entry",
    prompt: "When and what size to open initial position",
  },
  {
    key: "adding",
    label: "Adding",
    prompt: "When and how to increase size of position",
  },
] as const;

export type PlanField = (typeof PLAN_FIELDS)[number]["key"];

export type PlanDetails = Record<PlanField, string | null>;

/** Holds the one assertion that a PLAN_FIELDS-derived object covers every PlanField. */
export function planFieldRecord<T>(
  build: (field: (typeof PLAN_FIELDS)[number]) => T,
): Record<PlanField, T> {
  return Object.fromEntries(
    PLAN_FIELDS.map((field) => [field.key, build(field)]),
  ) as Record<PlanField, T>;
}

export function emptyPlanDetails(): PlanDetails {
  return planFieldRecord<string | null>(() => null);
}

export type PlanMissingField = PlanField | "targetAllocationPercent";

/** A presence check, not a quality one — an answered field can still be mush. */
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
