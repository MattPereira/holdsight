import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { manualBalanceItems } from "@/db/schema/manual-balance-items";

export type ManualBalanceItemKind = "asset" | "liability";

export type ManualBalanceItemRow = {
  id: string;
  kind: ManualBalanceItemKind;
  symbol: string;
  name: string;
  currency: string;
  amount: number;
};

export type ManualBalanceItemInput = {
  kind: ManualBalanceItemKind;
  symbol: string;
  name: string;
  amount: number;
  currency?: string;
};

function validateInput(
  input: ManualBalanceItemInput,
): { error: string } | { values: Required<ManualBalanceItemInput> } {
  const symbol = input.symbol.trim();
  const name = input.name.trim();
  const currency = (input.currency ?? "USD").trim().toUpperCase() || "USD";

  if (!name) return { error: "Enter a name." };
  if (!symbol) return { error: "Enter a symbol." };
  if (!Number.isFinite(input.amount)) return { error: "Enter a valid amount." };

  return {
    values: { kind: input.kind, symbol, name, amount: input.amount, currency },
  };
}

export async function getUserManualBalanceItems(
  userId: string,
): Promise<ManualBalanceItemRow[]> {
  const rows = await db
    .select({
      id: manualBalanceItems.id,
      kind: manualBalanceItems.kind,
      symbol: manualBalanceItems.symbol,
      name: manualBalanceItems.name,
      currency: manualBalanceItems.currency,
      amount: manualBalanceItems.amount,
    })
    .from(manualBalanceItems)
    .where(eq(manualBalanceItems.userId, userId))
    .orderBy(desc(manualBalanceItems.createdAt));

  return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function createManualBalanceItem(
  userId: string,
  input: ManualBalanceItemInput,
): Promise<{ error: string | null }> {
  const result = validateInput(input);
  if ("error" in result) return { error: result.error };

  const { kind, symbol, name, amount, currency } = result.values;
  await db.insert(manualBalanceItems).values({
    userId,
    kind,
    symbol,
    name,
    currency,
    amount: String(amount),
  });

  return { error: null };
}

export async function updateUserManualBalanceItem(
  userId: string,
  itemId: string,
  input: ManualBalanceItemInput,
): Promise<{ error: string | null }> {
  const result = validateInput(input);
  if ("error" in result) return { error: result.error };

  const { kind, symbol, name, amount, currency } = result.values;
  await db
    .update(manualBalanceItems)
    .set({ kind, symbol, name, amount: String(amount), currency })
    .where(
      and(
        eq(manualBalanceItems.id, itemId),
        eq(manualBalanceItems.userId, userId),
      ),
    );

  return { error: null };
}

export async function removeUserManualBalanceItem(
  userId: string,
  itemId: string,
): Promise<void> {
  await db
    .delete(manualBalanceItems)
    .where(
      and(
        eq(manualBalanceItems.id, itemId),
        eq(manualBalanceItems.userId, userId),
      ),
    );
}
