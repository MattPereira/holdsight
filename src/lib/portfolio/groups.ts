import "server-only";

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { assetGroupMembers, assetGroups } from "@/db/schema/asset-groups";
import {
  MAX_ASSET_GROUP_THESIS_SECTION_LENGTH,
  type AssetGroupThesis,
} from "@/lib/portfolio/asset-group-thesis";
import { ASSET_CHART_COLORS, type AssetGroup } from "@/lib/portfolio/asset-totals";

const MIN_GROUP_SYMBOLS = 1;
const MAX_GROUP_NAME_LENGTH = 40;
const GROUP_COLORS = new Set(ASSET_CHART_COLORS);

type AssetGroupInput = {
  name?: string | null;
  color?: string | null;
  thesis: AssetGroupThesis;
  targetAllocationPercent?: number | null;
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

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_GROUP_NAME_LENGTH);
}

function normalizeColor(color: string | null | undefined): string | null {
  const trimmed = color?.trim();
  if (!trimmed) return null;
  return GROUP_COLORS.has(trimmed) ? trimmed : null;
}

function normalizeThesisSection(
  value: unknown,
  label: string,
): { value: string | null; error: string | null } {
  if (value !== null && value !== undefined && typeof value !== "string") {
    return { value: null, error: `${label} must be text.` };
  }
  const trimmed = value?.trim();
  if (!trimmed) return { value: null, error: null };
  if (trimmed.length > MAX_ASSET_GROUP_THESIS_SECTION_LENGTH) {
    return {
      value: null,
      error: `${label} must be ${MAX_ASSET_GROUP_THESIS_SECTION_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }
  return { value: trimmed, error: null };
}

function normalizeThesis(
  thesis: AssetGroupThesis | null | undefined,
): { thesis: AssetGroupThesis; error: string | null } {
  const sections = {
    summary: normalizeThesisSection(thesis?.summary, "Thesis summary"),
    bullCase: normalizeThesisSection(thesis?.bullCase, "Bull case"),
    bearCase: normalizeThesisSection(thesis?.bearCase, "Bear case"),
    invalidationCriteria: normalizeThesisSection(
      thesis?.invalidationCriteria,
      "Invalidation criteria",
    ),
    allocationStrategyNotes: normalizeThesisSection(
      thesis?.allocationStrategyNotes,
      "Allocation strategy notes",
    ),
  };
  const error = Object.values(sections).find((section) => section.error)?.error;

  return {
    thesis: {
      summary: sections.summary.value,
      bullCase: sections.bullCase.value,
      bearCase: sections.bearCase.value,
      invalidationCriteria: sections.invalidationCriteria.value,
      allocationStrategyNotes: sections.allocationStrategyNotes.value,
    },
    error: error ?? null,
  };
}

function normalizeTargetAllocation(
  target: number | null | undefined,
): { targetAllocationPercent: number | null; error: string | null } {
  if (target === null || target === undefined) {
    return { targetAllocationPercent: null, error: null };
  }
  if (!Number.isFinite(target) || target < 0 || target > 100) {
    return {
      targetAllocationPercent: null,
      error: "Target allocation must be between 0% and 100%.",
    };
  }
  const rounded = Math.round(target * 100) / 100;
  if (Math.abs(target - rounded) > Number.EPSILON) {
    return {
      targetAllocationPercent: null,
      error: "Target allocation can have at most two decimal places.",
    };
  }
  return { targetAllocationPercent: rounded, error: null };
}

export async function getUserAssetGroups(userId: string): Promise<AssetGroup[]> {
  const rows = await db
    .select({
      id: assetGroups.id,
      name: assetGroups.name,
      color: assetGroups.color,
      thesisSummary: assetGroups.thesisSummary,
      bullCase: assetGroups.bullCase,
      bearCase: assetGroups.bearCase,
      invalidationCriteria: assetGroups.invalidationCriteria,
      allocationStrategyNotes: assetGroups.allocationStrategyNotes,
      targetAllocationPercent: assetGroups.targetAllocationPercent,
      createdAt: assetGroups.createdAt,
      updatedAt: assetGroups.updatedAt,
      symbol: assetGroupMembers.symbol,
    })
    .from(assetGroups)
    .leftJoin(
      assetGroupMembers,
      eq(assetGroupMembers.groupId, assetGroups.id),
    )
    .where(eq(assetGroups.userId, userId))
    .orderBy(assetGroups.createdAt);

  const byId = new Map<string, AssetGroup>();
  for (const row of rows) {
    let group = byId.get(row.id);
    if (!group) {
      group = {
        id: row.id,
        name: row.name,
        color: row.color,
        thesis: {
          summary: row.thesisSummary,
          bullCase: row.bullCase,
          bearCase: row.bearCase,
          invalidationCriteria: row.invalidationCriteria,
          allocationStrategyNotes: row.allocationStrategyNotes,
        },
        targetAllocationPercent: row.targetAllocationPercent,
        updatedAt: row.updatedAt.toISOString(),
        symbols: [],
      };
      byId.set(row.id, group);
    }
    if (row.symbol) group.symbols.push(row.symbol);
  }

  return Array.from(byId.values());
}

/**
 * Detach symbols from any group they currently belong to so a symbol never
 * lives in two groups at once (keeps combined totals honest).
 */
async function detachSymbols(
  userId: string,
  symbols: string[],
): Promise<void> {
  if (symbols.length === 0) return;
  await db
    .delete(assetGroupMembers)
    .where(
      and(
        eq(assetGroupMembers.userId, userId),
        inArray(assetGroupMembers.symbol, symbols),
      ),
    );
}

export async function createAssetGroup(
  userId: string,
  input: AssetGroupInput,
): Promise<{ error: string | null }> {
  const symbols = normalizeSymbols(input.symbols);
  if (symbols.length < MIN_GROUP_SYMBOLS) {
    return { error: "Select at least one asset to group." };
  }

  const thesis = normalizeThesis(input.thesis);
  if (thesis.error) return { error: thesis.error };
  const targetAllocation = normalizeTargetAllocation(
    input.targetAllocationPercent,
  );
  if (targetAllocation.error) return { error: targetAllocation.error };

  await detachSymbols(userId, symbols);

  const groupId = randomUUID();
  await db.insert(assetGroups).values({
    id: groupId,
    userId,
    name: normalizeName(input.name),
    color: normalizeColor(input.color),
    thesisSummary: thesis.thesis.summary,
    bullCase: thesis.thesis.bullCase,
    bearCase: thesis.thesis.bearCase,
    invalidationCriteria: thesis.thesis.invalidationCriteria,
    allocationStrategyNotes: thesis.thesis.allocationStrategyNotes,
    targetAllocationPercent: targetAllocation.targetAllocationPercent,
  });
  await db.insert(assetGroupMembers).values(
    symbols.map((symbol) => ({ groupId, userId, symbol })),
  );

  return { error: null };
}

export async function updateAssetGroup(
  userId: string,
  groupId: string,
  input: AssetGroupInput,
): Promise<{ error: string | null }> {
  const [group] = await db
    .select({ id: assetGroups.id })
    .from(assetGroups)
    .where(and(eq(assetGroups.id, groupId), eq(assetGroups.userId, userId)))
    .limit(1);
  if (!group) return { error: "Group not found." };

  const symbols = normalizeSymbols(input.symbols);
  if (symbols.length < MIN_GROUP_SYMBOLS) {
    return { error: "Select at least one asset to group." };
  }

  const thesis = normalizeThesis(input.thesis);
  if (thesis.error) return { error: thesis.error };
  const targetAllocation = normalizeTargetAllocation(
    input.targetAllocationPercent,
  );
  if (targetAllocation.error) return { error: targetAllocation.error };

  await detachSymbols(userId, symbols);
  await db
    .delete(assetGroupMembers)
    .where(
      and(
        eq(assetGroupMembers.groupId, groupId),
        eq(assetGroupMembers.userId, userId),
      ),
    );
  await db
    .update(assetGroups)
    .set({
      name: normalizeName(input.name),
      color: normalizeColor(input.color),
      thesisSummary: thesis.thesis.summary,
      bullCase: thesis.thesis.bullCase,
      bearCase: thesis.thesis.bearCase,
      invalidationCriteria: thesis.thesis.invalidationCriteria,
      allocationStrategyNotes: thesis.thesis.allocationStrategyNotes,
      targetAllocationPercent: targetAllocation.targetAllocationPercent,
    })
    .where(and(eq(assetGroups.id, groupId), eq(assetGroups.userId, userId)));
  await db.insert(assetGroupMembers).values(
    symbols.map((symbol) => ({ groupId, userId, symbol })),
  );

  return { error: null };
}

export async function removeAssetGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  await db
    .delete(assetGroups)
    .where(and(eq(assetGroups.id, groupId), eq(assetGroups.userId, userId)));
}
