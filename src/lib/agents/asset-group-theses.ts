import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { assetGroupMembers, assetGroups } from "@/db/schema/asset-groups";
import {
  MAX_ASSET_GROUP_THESIS_SECTION_LENGTH,
  serializeAssetGroupThesis,
  type AssetGroupThesis,
} from "@/lib/portfolio/asset-group-thesis";

export type AgentAssetGroupThesisPatch = Partial<AssetGroupThesis>;

export type AgentAssetGroupThesis = {
  assetGroup: {
    id: string;
    name: string | null;
    symbols: string[];
  };
  thesis: ReturnType<typeof serializeAssetGroupThesis>;
  updatedAt: string;
};

export type AgentAssetGroupThesisListItem = {
  id: string;
  name: string | null;
  symbols: string[];
  summary: string | null;
  completion: ReturnType<typeof serializeAssetGroupThesis>["completion"];
  updatedAt: string;
};

export class AgentAssetGroupThesisError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid_input" | "not_found",
  ) {
    super(message);
  }
}

function normalizeSection(
  value: string | null,
  label: string,
): string | null {
  if (value === null) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_ASSET_GROUP_THESIS_SECTION_LENGTH) {
    throw new AgentAssetGroupThesisError(
      `${label} must be ${MAX_ASSET_GROUP_THESIS_SECTION_LENGTH.toLocaleString()} characters or fewer.`,
      "invalid_input",
    );
  }
  return trimmed;
}

function serializeAgentThesis(
  group: {
    id: string;
    name: string | null;
    thesisSummary: string | null;
    bullCase: string | null;
    bearCase: string | null;
    invalidationCriteria: string | null;
    allocationStrategyNotes: string | null;
    targetAllocationPercent: number | null;
    updatedAt: Date;
  },
  symbols: string[],
): AgentAssetGroupThesis {
  return {
    assetGroup: {
      id: group.id,
      name: group.name,
      symbols,
    },
    thesis: serializeAssetGroupThesis(
      {
        summary: group.thesisSummary,
        bullCase: group.bullCase,
        bearCase: group.bearCase,
        invalidationCriteria: group.invalidationCriteria,
        allocationStrategyNotes: group.allocationStrategyNotes,
      },
      group.targetAllocationPercent,
    ),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export async function listAssetGroupThesesForAgent(
  userId: string,
): Promise<AgentAssetGroupThesisListItem[]> {
  const rows = await db
    .select({
      id: assetGroups.id,
      name: assetGroups.name,
      thesisSummary: assetGroups.thesisSummary,
      bullCase: assetGroups.bullCase,
      bearCase: assetGroups.bearCase,
      invalidationCriteria: assetGroups.invalidationCriteria,
      allocationStrategyNotes: assetGroups.allocationStrategyNotes,
      targetAllocationPercent: assetGroups.targetAllocationPercent,
      updatedAt: assetGroups.updatedAt,
      createdAt: assetGroups.createdAt,
      symbol: assetGroupMembers.symbol,
    })
    .from(assetGroups)
    .leftJoin(
      assetGroupMembers,
      eq(assetGroupMembers.groupId, assetGroups.id),
    )
    .where(eq(assetGroups.userId, userId))
    .orderBy(assetGroups.createdAt, assetGroupMembers.symbol);

  const groups = new Map<
    string,
    { group: (typeof rows)[number]; symbols: string[] }
  >();
  for (const row of rows) {
    const existing = groups.get(row.id);
    if (existing) {
      if (row.symbol) existing.symbols.push(row.symbol);
      continue;
    }
    groups.set(row.id, {
      group: row,
      symbols: row.symbol ? [row.symbol] : [],
    });
  }

  return Array.from(groups.values(), ({ group, symbols }) => {
    const serialized = serializeAgentThesis(group, symbols);
    return {
      id: serialized.assetGroup.id,
      name: serialized.assetGroup.name,
      symbols: serialized.assetGroup.symbols,
      summary: serialized.thesis.summary,
      completion: serialized.thesis.completion,
      updatedAt: serialized.updatedAt,
    };
  });
}

export async function getAssetGroupThesisForAgent(
  userId: string,
  assetGroupId: string,
): Promise<AgentAssetGroupThesis> {
  const rows = await db
    .select({
      id: assetGroups.id,
      name: assetGroups.name,
      thesisSummary: assetGroups.thesisSummary,
      bullCase: assetGroups.bullCase,
      bearCase: assetGroups.bearCase,
      invalidationCriteria: assetGroups.invalidationCriteria,
      allocationStrategyNotes: assetGroups.allocationStrategyNotes,
      targetAllocationPercent: assetGroups.targetAllocationPercent,
      updatedAt: assetGroups.updatedAt,
      symbol: assetGroupMembers.symbol,
    })
    .from(assetGroups)
    .leftJoin(
      assetGroupMembers,
      eq(assetGroupMembers.groupId, assetGroups.id),
    )
    .where(
      and(
        eq(assetGroups.id, assetGroupId),
        eq(assetGroups.userId, userId),
      ),
    );

  const [group] = rows;
  if (!group) {
    throw new AgentAssetGroupThesisError(
      "Asset group not found for the authenticated user.",
      "not_found",
    );
  }

  return serializeAgentThesis(
    group,
    rows.flatMap((row) => (row.symbol ? [row.symbol] : [])),
  );
}

export async function updateAssetGroupThesisForAgent(
  userId: string,
  assetGroupId: string,
  expectedUpdatedAt: string,
  patch: AgentAssetGroupThesisPatch,
): Promise<AgentAssetGroupThesis> {
  const current = await getAssetGroupThesisForAgent(userId, assetGroupId);
  const updates: Partial<{
    thesisSummary: string | null;
    bullCase: string | null;
    bearCase: string | null;
    invalidationCriteria: string | null;
    allocationStrategyNotes: string | null;
  }> = {};

  if (patch.summary !== undefined) {
    updates.thesisSummary = normalizeSection(patch.summary, "Summary");
  }
  if (patch.bullCase !== undefined) {
    updates.bullCase = normalizeSection(patch.bullCase, "Bull case");
  }
  if (patch.bearCase !== undefined) {
    updates.bearCase = normalizeSection(patch.bearCase, "Bear case");
  }
  if (patch.invalidationCriteria !== undefined) {
    updates.invalidationCriteria = normalizeSection(
      patch.invalidationCriteria,
      "Invalidation criteria",
    );
  }
  if (patch.allocationStrategyNotes !== undefined) {
    updates.allocationStrategyNotes = normalizeSection(
      patch.allocationStrategyNotes,
      "Allocation strategy notes",
    );
  }

  if (Object.keys(updates).length === 0) {
    throw new AgentAssetGroupThesisError(
      "Provide at least one thesis field to update.",
      "invalid_input",
    );
  }

  const expectedTimestamp = new Date(expectedUpdatedAt);
  const updatedAt = new Date(
    Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
  );
  const [updated] = await db
    .update(assetGroups)
    .set({ ...updates, updatedAt })
    .where(
      and(
        eq(assetGroups.id, assetGroupId),
        eq(assetGroups.userId, userId),
        eq(assetGroups.updatedAt, expectedTimestamp),
      ),
    )
    .returning({
      id: assetGroups.id,
      name: assetGroups.name,
      thesisSummary: assetGroups.thesisSummary,
      bullCase: assetGroups.bullCase,
      bearCase: assetGroups.bearCase,
      invalidationCriteria: assetGroups.invalidationCriteria,
      allocationStrategyNotes: assetGroups.allocationStrategyNotes,
      targetAllocationPercent: assetGroups.targetAllocationPercent,
      updatedAt: assetGroups.updatedAt,
    });

  if (!updated) {
    throw new AgentAssetGroupThesisError(
      `The asset group changed after it was read (current updatedAt: ${current.updatedAt}). Read the thesis again before retrying.`,
      "conflict",
    );
  }

  return serializeAgentThesis(updated, current.assetGroup.symbols);
}
