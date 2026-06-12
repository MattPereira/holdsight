import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { creditAccounts } from "@/db/schema/credit-accounts";
import { depositoryAccounts } from "@/db/schema/depository-accounts";
import {
  brokerageAccounts,
  investmentAccounts,
  plaidItems,
} from "@/db/schema/investment-accounts";
import { removeItem } from "@/lib/plaid/client";
import { decrypt, encrypt } from "@/lib/plaid/crypto";

export type SavedPlaidItem = {
  id: string;
  itemId: string;
  accessTokenEncrypted: string;
  institutionName: string | null;
  status: "active" | "login_required" | "error" | "disabled";
};

/**
 * Insert (or refresh, on re-link) the Plaid Item row and return its id. The
 * access token is encrypted before it touches the database. Shared by every
 * account domain; brokerage and depository can each have their own Items.
 */
export async function upsertPlaidItem(
  userId: string,
  exchange: { accessToken: string; itemId: string },
  institution: { institutionId: string | null; institutionName: string | null },
): Promise<string> {
  const accessTokenEncrypted = encrypt(exchange.accessToken);

  const [item] = await db
    .insert(plaidItems)
    .values({
      userId,
      itemId: exchange.itemId,
      accessTokenEncrypted,
      institutionId: institution.institutionId,
      institutionName: institution.institutionName,
      status: "active",
    })
    .onConflictDoUpdate({
      target: plaidItems.itemId,
      set: {
        accessTokenEncrypted,
        institutionId: institution.institutionId,
        institutionName: institution.institutionName,
        status: "active",
      },
    })
    .returning({ id: plaidItems.id });

  return item.id;
}

export async function getUserPlaidItems(
  userId: string,
): Promise<SavedPlaidItem[]> {
  return db
    .select({
      id: plaidItems.id,
      itemId: plaidItems.itemId,
      accessTokenEncrypted: plaidItems.accessTokenEncrypted,
      institutionName: plaidItems.institutionName,
      status: plaidItems.status,
    })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(plaidItems.createdAt));
}

function uniqueItems(rows: SavedPlaidItem[]): SavedPlaidItem[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function getUserBrokeragePlaidItems(
  userId: string,
): Promise<SavedPlaidItem[]> {
  const rows = await db
    .select({
      id: plaidItems.id,
      itemId: plaidItems.itemId,
      accessTokenEncrypted: plaidItems.accessTokenEncrypted,
      institutionName: plaidItems.institutionName,
      status: plaidItems.status,
    })
    .from(plaidItems)
    .innerJoin(
      brokerageAccounts,
      eq(brokerageAccounts.plaidItemId, plaidItems.id),
    )
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(plaidItems.createdAt));

  return uniqueItems(rows);
}

export async function getUserDepositoryPlaidItems(
  userId: string,
): Promise<SavedPlaidItem[]> {
  const rows = await db
    .select({
      id: plaidItems.id,
      itemId: plaidItems.itemId,
      accessTokenEncrypted: plaidItems.accessTokenEncrypted,
      institutionName: plaidItems.institutionName,
      status: plaidItems.status,
    })
    .from(plaidItems)
    .innerJoin(
      depositoryAccounts,
      eq(depositoryAccounts.plaidItemId, plaidItems.id),
    )
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(plaidItems.createdAt));

  return uniqueItems(rows);
}

export async function getUserCreditCardPlaidItems(
  userId: string,
): Promise<SavedPlaidItem[]> {
  const rows = await db
    .select({
      id: plaidItems.id,
      itemId: plaidItems.itemId,
      accessTokenEncrypted: plaidItems.accessTokenEncrypted,
      institutionName: plaidItems.institutionName,
      status: plaidItems.status,
    })
    .from(plaidItems)
    .innerJoin(creditAccounts, eq(creditAccounts.plaidItemId, plaidItems.id))
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(plaidItems.createdAt));

  return uniqueItems(rows);
}

/**
 * Unlink a Plaid Item: revoke it at Plaid (best-effort) and delete it locally.
 * Deleting the investment accounts cascades to their brokerage rows + balances;
 * deleting the Item row cascades to its depository and credit-card accounts.
 * Scoped to the user.
 */
export async function removeUserPlaidItem(
  userId: string,
  plaidItemId: string,
): Promise<void> {
  const [item] = await db
    .select({ accessTokenEncrypted: plaidItems.accessTokenEncrypted })
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.userId, userId)))
    .limit(1);

  if (!item) return;

  // Best-effort revoke. A stale sandbox token will 400 against the production
  // API — we still want the local rows gone, so swallow the error.
  try {
    await removeItem(decrypt(item.accessTokenEncrypted));
  } catch {
    /* best-effort: proceed with local deletion regardless */
  }

  const accounts = await db
    .select({ investmentAccountId: brokerageAccounts.investmentAccountId })
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.plaidItemId, plaidItemId));

  await db.transaction(async (tx) => {
    // Brokerage: delete the investment accounts (cascades brokerage rows +
    // balances). Depository accounts cascade from the plaid_items delete below.
    for (const account of accounts) {
      await tx
        .delete(investmentAccounts)
        .where(
          and(
            eq(investmentAccounts.id, account.investmentAccountId),
            eq(investmentAccounts.userId, userId),
          ),
        );
    }

    await tx
      .delete(plaidItems)
      .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.userId, userId)));
  });
}
