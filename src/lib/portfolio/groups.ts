import "server-only";

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { assetGroupMembers, assetGroups } from "@/db/schema/asset-groups";
import type { AssetGroup } from "@/lib/portfolio/asset-totals";

const MIN_GROUP_SYMBOLS = 2;
const MAX_GROUP_NAME_LENGTH = 40;

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

export async function getUserAssetGroups(userId: string): Promise<AssetGroup[]> {
  const rows = await db
    .select({
      id: assetGroups.id,
      name: assetGroups.name,
      createdAt: assetGroups.createdAt,
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
      group = { id: row.id, name: row.name, symbols: [] };
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
  input: { name?: string | null; symbols: string[] },
): Promise<{ error: string | null }> {
  const symbols = normalizeSymbols(input.symbols);
  if (symbols.length < MIN_GROUP_SYMBOLS) {
    return { error: `Select at least ${MIN_GROUP_SYMBOLS} assets to group.` };
  }

  await detachSymbols(userId, symbols);

  const groupId = randomUUID();
  await db.insert(assetGroups).values({
    id: groupId,
    userId,
    name: normalizeName(input.name),
  });
  await db.insert(assetGroupMembers).values(
    symbols.map((symbol) => ({ groupId, userId, symbol })),
  );

  return { error: null };
}

export async function updateAssetGroup(
  userId: string,
  groupId: string,
  input: { name?: string | null; symbols: string[] },
): Promise<{ error: string | null }> {
  const [group] = await db
    .select({ id: assetGroups.id })
    .from(assetGroups)
    .where(and(eq(assetGroups.id, groupId), eq(assetGroups.userId, userId)))
    .limit(1);
  if (!group) return { error: "Group not found." };

  const symbols = normalizeSymbols(input.symbols);
  if (symbols.length < MIN_GROUP_SYMBOLS) {
    return { error: `Select at least ${MIN_GROUP_SYMBOLS} assets to group.` };
  }

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
    .set({ name: normalizeName(input.name) })
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
