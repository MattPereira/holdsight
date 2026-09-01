import { ASSET_CHART_COLORS } from "@/lib/portfolio/asset-totals";

export const MAX_PLAN_NAME_LENGTH = 40;
export const MAX_PLAN_TEXT_LENGTH = 10_000;

export type PlanDetails = {
  thesis: string | null;
  invalidation: string | null;
  entry: string | null;
  exit: string | null;
};

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

  const sections = {
    thesis: normalizeText(input.details.thesis, "Thesis"),
    invalidation: normalizeText(input.details.invalidation, "Invalidation"),
    entry: normalizeText(input.details.entry, "Entry"),
    exit: normalizeText(input.details.exit, "Exit"),
  };
  const sectionError = Object.values(sections).find(
    (section) => section.error,
  )?.error;
  if (sectionError) return { value: null, error: sectionError };

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
      details: {
        thesis: sections.thesis.value,
        invalidation: sections.invalidation.value,
        entry: sections.entry.value,
        exit: sections.exit.value,
      },
      targetAllocationPercent: target.value,
      symbols: normalizeSymbols(input.symbols),
    },
    error: null,
  };
}
