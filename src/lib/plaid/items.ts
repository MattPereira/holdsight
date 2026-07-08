import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { creditAccounts } from "@/db/schema/credit-accounts";
import { depositoryAccounts } from "@/db/schema/depository-accounts";
import {
  brokerageAccounts,
  brokerageConnections,
  investmentAccounts,
  plaidItems,
} from "@/db/schema/investment-accounts";
import { readPlaidError, removeItem } from "@/lib/plaid/client";
import { decrypt, encrypt } from "@/lib/plaid/crypto";

/**
 * Thrown when revoking an Item at Plaid fails for a transient/unknown reason
 * (network, 5xx, rate limit) — i.e. the authorization may still be live, so the
 * caller must NOT delete local rows. Callers surface this as a retryable error.
 */
export class PlaidRevokeError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PlaidRevokeError";
  }
}

export type SavedPlaidItem = {
  id: string;
  itemId: string;
  accessTokenEncrypted: string;
  institutionName: string | null;
  status: "active" | "login_required" | "error" | "disabled";
  accountNames?: string[];
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
  const accessTokenEncrypted = encrypt(exchange.accessToken, userId);

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
  const items = await db
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

  return withAccountNames(userId, items);
}

function accountLabel(
  label: string | null,
  mask: string | null,
  fallback: string,
): string {
  const name = label?.trim() || fallback;
  return mask ? `${name} ••${mask}` : name;
}

async function withAccountNames(
  userId: string,
  items: SavedPlaidItem[],
): Promise<SavedPlaidItem[]> {
  if (items.length === 0) return items;

  const itemIds = items.map((item) => item.id);
  const [depositoryRows, creditRows, brokerageRows] = await Promise.all([
    db
      .select({
        plaidItemId: depositoryAccounts.plaidItemId,
        label: depositoryAccounts.label,
        mask: depositoryAccounts.accountMask,
        kind: depositoryAccounts.kind,
      })
      .from(depositoryAccounts)
      .where(
        and(
          eq(depositoryAccounts.userId, userId),
          inArray(depositoryAccounts.plaidItemId, itemIds),
        ),
      ),
    db
      .select({
        plaidItemId: creditAccounts.plaidItemId,
        label: creditAccounts.label,
        mask: creditAccounts.accountMask,
      })
      .from(creditAccounts)
      .where(
        and(
          eq(creditAccounts.userId, userId),
          inArray(creditAccounts.plaidItemId, itemIds),
        ),
      ),
    db
      .select({
        plaidItemId: brokerageAccounts.plaidItemId,
        label: investmentAccounts.label,
      })
      .from(brokerageAccounts)
      .innerJoin(
        investmentAccounts,
        eq(investmentAccounts.id, brokerageAccounts.investmentAccountId),
      )
      .where(
        and(
          eq(investmentAccounts.userId, userId),
          inArray(brokerageAccounts.plaidItemId, itemIds),
        ),
      ),
  ]);

  const namesByItemId = new Map<string, string[]>();

  function addName(plaidItemId: string | null, name: string): void {
    if (!plaidItemId) return;
    const names = namesByItemId.get(plaidItemId) ?? [];
    names.push(name);
    namesByItemId.set(plaidItemId, names);
  }

  for (const row of depositoryRows) {
    addName(
      row.plaidItemId,
      accountLabel(
        row.label,
        row.mask,
        row.kind === "savings" ? "Savings" : "Checking",
      ),
    );
  }

  for (const row of creditRows) {
    addName(row.plaidItemId, accountLabel(null, row.mask, "Credit card"));
  }

  for (const row of brokerageRows) {
    addName(row.plaidItemId, row.label?.trim() || "Brokerage");
  }

  return items.map((item) => ({
    ...item,
    accountNames: namesByItemId.get(item.id) ?? [],
  }));
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
    .select({
      accessTokenEncrypted: plaidItems.accessTokenEncrypted,
      itemId: plaidItems.itemId,
    })
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.userId, userId)))
    .limit(1);

  if (!item) return;

  // Revoke at Plaid before touching the DB: the access token we need to revoke
  // lives in the row we're about to delete, so a delete-first ordering would
  // make a failed revoke permanently unrecoverable (a live, billable auth with
  // no local record). Only swallow errors that mean the Item/token is already
  // gone at Plaid; treat anything else as retryable so the row survives.
  try {
    await removeItem(decrypt(item.accessTokenEncrypted, userId));
  } catch (error) {
    const { code, message, httpStatus } = readPlaidError(error);
    // ITEM_NOT_FOUND / INVALID_ACCESS_TOKEN: the authorization no longer exists
    // (e.g. a stale sandbox token revoked against production). Nothing live to
    // leak, so proceed with local deletion.
    const alreadyRevoked =
      code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN";
    if (!alreadyRevoked) {
      throw new PlaidRevokeError(message, code, httpStatus);
    }
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

    await tx
      .delete(brokerageConnections)
      .where(
        and(
          eq(brokerageConnections.userId, userId),
          eq(brokerageConnections.provider, "plaid"),
          eq(brokerageConnections.externalConnectionId, item.itemId),
        ),
      );
  });
}
