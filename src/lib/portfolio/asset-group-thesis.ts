export const MAX_ASSET_GROUP_THESIS_SECTION_LENGTH = 10_000;

export type AssetGroupThesis = {
  summary: string | null;
  bullCase: string | null;
  bearCase: string | null;
  invalidationCriteria: string | null;
  allocationStrategyNotes: string | null;
};

export type AssetGroupThesisMissingField =
  | "summary"
  | "bullCase"
  | "bearCase"
  | "invalidationCriteria"
  | "allocationStrategy.targetAllocationPercent"
  | "allocationStrategy.notes";

export type AssetGroupThesisCompletion = {
  completedSections: number;
  totalSections: 5;
  isComplete: boolean;
  missing: AssetGroupThesisMissingField[];
};

export type AssetGroupThesisForAgent = {
  summary: string | null;
  bullCase: string | null;
  bearCase: string | null;
  invalidationCriteria: string | null;
  allocationStrategy: {
    targetAllocationPercent: number | null;
    notes: string | null;
  };
  completion: AssetGroupThesisCompletion;
};

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

export function getAssetGroupThesisCompletion(
  thesis: AssetGroupThesis,
  targetAllocationPercent: number | null,
): AssetGroupThesisCompletion {
  const missing: AssetGroupThesisMissingField[] = [];
  let completedSections = 0;

  for (const [field, value] of [
    ["summary", thesis.summary],
    ["bullCase", thesis.bullCase],
    ["bearCase", thesis.bearCase],
    ["invalidationCriteria", thesis.invalidationCriteria],
  ] as const) {
    if (hasText(value)) completedSections += 1;
    else missing.push(field);
  }

  const hasTargetAllocation = targetAllocationPercent !== null;
  const hasAllocationNotes = hasText(thesis.allocationStrategyNotes);
  if (hasTargetAllocation && hasAllocationNotes) {
    completedSections += 1;
  } else {
    if (!hasTargetAllocation) {
      missing.push("allocationStrategy.targetAllocationPercent");
    }
    if (!hasAllocationNotes) missing.push("allocationStrategy.notes");
  }

  return {
    completedSections,
    totalSections: 5,
    isComplete: completedSections === 5,
    missing,
  };
}

export function serializeAssetGroupThesis(
  thesis: AssetGroupThesis,
  targetAllocationPercent: number | null,
): AssetGroupThesisForAgent {
  return {
    summary: thesis.summary,
    bullCase: thesis.bullCase,
    bearCase: thesis.bearCase,
    invalidationCriteria: thesis.invalidationCriteria,
    allocationStrategy: {
      targetAllocationPercent,
      notes: thesis.allocationStrategyNotes,
    },
    completion: getAssetGroupThesisCompletion(
      thesis,
      targetAllocationPercent,
    ),
  };
}
