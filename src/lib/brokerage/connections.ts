import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  brokerageConnections,
  plaidItems,
} from "@/db/schema/investment-accounts";
import { PLAID_BROKERAGE_PROVIDER } from "@/lib/brokerage/providers/plaid/client";
import { SCHWAB_BROKERAGE_PROVIDER } from "@/lib/brokerage/providers/schwab/config";

export type SavedBrokerageConnection = {
  id: string;
  userId: string;
  provider: string;
  externalConnectionId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  institutionId: string | null;
  institutionName: string | null;
  status: "active" | "login_required" | "error" | "disabled";
  lastSyncedAt: Date | null;
};

export async function getUserSchwabConnections(
  userId: string,
): Promise<SavedBrokerageConnection[]> {
  return db
    .select({
      id: brokerageConnections.id,
      userId: brokerageConnections.userId,
      provider: brokerageConnections.provider,
      externalConnectionId: brokerageConnections.externalConnectionId,
      accessTokenEncrypted: brokerageConnections.accessTokenEncrypted,
      refreshTokenEncrypted: brokerageConnections.refreshTokenEncrypted,
      tokenExpiresAt: brokerageConnections.tokenExpiresAt,
      institutionId: brokerageConnections.institutionId,
      institutionName: brokerageConnections.institutionName,
      status: brokerageConnections.status,
      lastSyncedAt: brokerageConnections.lastSyncedAt,
    })
    .from(brokerageConnections)
    .where(
      and(
        eq(brokerageConnections.userId, userId),
        eq(brokerageConnections.provider, SCHWAB_BROKERAGE_PROVIDER),
      ),
    )
    .orderBy(desc(brokerageConnections.createdAt));
}

export async function removeUserSchwabConnection(
  userId: string,
  connectionId: string,
): Promise<void> {
  await db
    .delete(brokerageConnections)
    .where(
      and(
        eq(brokerageConnections.id, connectionId),
        eq(brokerageConnections.userId, userId),
        eq(brokerageConnections.provider, SCHWAB_BROKERAGE_PROVIDER),
      ),
    );
}

/**
 * Mirror a Plaid Item into the provider-neutral brokerage connection table.
 * During the migration, Plaid remains the source of truth for Plaid Link
 * lifecycle, while brokerage_accounts can start pointing at this neutral row.
 */
export async function upsertPlaidBrokerageConnection(
  plaidItemId: string,
): Promise<string> {
  const [plaidItem] = await db
    .select({
      id: plaidItems.id,
      userId: plaidItems.userId,
      itemId: plaidItems.itemId,
      accessTokenEncrypted: plaidItems.accessTokenEncrypted,
      institutionId: plaidItems.institutionId,
      institutionName: plaidItems.institutionName,
      status: plaidItems.status,
      lastSyncedAt: plaidItems.lastSyncedAt,
    })
    .from(plaidItems)
    .where(eq(plaidItems.id, plaidItemId))
    .limit(1);

  if (!plaidItem) {
    throw new Error("Plaid Item no longer exists.");
  }

  const [connection] = await db
    .insert(brokerageConnections)
    .values({
      userId: plaidItem.userId,
      provider: PLAID_BROKERAGE_PROVIDER,
      externalConnectionId: plaidItem.itemId,
      accessTokenEncrypted: plaidItem.accessTokenEncrypted,
      institutionId: plaidItem.institutionId,
      institutionName: plaidItem.institutionName,
      status: plaidItem.status,
      lastSyncedAt: plaidItem.lastSyncedAt,
      metadata: { plaidItemId: plaidItem.id },
    })
    .onConflictDoUpdate({
      target: [
        brokerageConnections.userId,
        brokerageConnections.provider,
        brokerageConnections.externalConnectionId,
      ],
      set: {
        accessTokenEncrypted: plaidItem.accessTokenEncrypted,
        institutionId: plaidItem.institutionId,
        institutionName: plaidItem.institutionName,
        status: plaidItem.status,
        lastSyncedAt: plaidItem.lastSyncedAt,
        metadata: { plaidItemId: plaidItem.id },
        updatedAt: new Date(),
      },
    })
    .returning({ id: brokerageConnections.id });

  return connection.id;
}
