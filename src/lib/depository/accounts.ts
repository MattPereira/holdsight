import "server-only";

import { and, desc, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { depositoryAccounts } from "@/db/schema/depository-accounts";
import type { PlaidDepositoryAccount } from "@/lib/plaid/client";

const PLAID_PROVIDER = "plaid";

export type DepositoryAccountRow = {
  id: string;
  plaidItemId: string | null;
  externalAccountId: string | null;
  kind: "checking" | "savings";
  label: string | null;
  institutionName: string | null;
  accountMask: string | null;
  currency: string;
  currentBalance: number;
  status: "active" | "disabled" | "error";
};

/**
 * Upsert the depository (checking/savings) accounts under a Plaid Item. Matches
 * existing rows by Plaid account_id so a re-link / refresh updates the stored
 * balance in place rather than duplicating. Used by both link and sync.
 */
export async function saveDepositoryAccounts(
  userId: string,
  plaidItemId: string,
  institutionName: string | null,
  accounts: PlaidDepositoryAccount[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const currentExternalAccountIds = accounts.map(
      (account) => account.externalAccountId,
    );

    await tx
      .delete(depositoryAccounts)
      .where(
        and(
          eq(depositoryAccounts.userId, userId),
          eq(depositoryAccounts.plaidItemId, plaidItemId),
          currentExternalAccountIds.length > 0
            ? notInArray(
                depositoryAccounts.externalAccountId,
                currentExternalAccountIds,
              )
            : undefined,
        ),
      );

    for (const account of accounts) {
      const [existing] = await tx
        .select({ id: depositoryAccounts.id })
        .from(depositoryAccounts)
        .where(
          and(
            eq(depositoryAccounts.userId, userId),
            eq(depositoryAccounts.externalAccountId, account.externalAccountId),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(depositoryAccounts)
          .set({
            plaidItemId,
            kind: account.kind,
            institutionName,
            accountMask: account.mask,
            currency: account.currency,
            currentBalance: String(account.currentBalance),
            status: "active",
          })
          .where(eq(depositoryAccounts.id, existing.id));
        continue;
      }

      await tx.insert(depositoryAccounts).values({
        userId,
        kind: account.kind,
        provider: PLAID_PROVIDER,
        plaidItemId,
        externalAccountId: account.externalAccountId,
        label: account.name,
        institutionName,
        accountMask: account.mask,
        currency: account.currency,
        currentBalance: String(account.currentBalance),
      });
    }
  });
}

export async function getUserDepositoryAccounts(
  userId: string,
): Promise<DepositoryAccountRow[]> {
  const rows = await db
    .select({
      id: depositoryAccounts.id,
      plaidItemId: depositoryAccounts.plaidItemId,
      externalAccountId: depositoryAccounts.externalAccountId,
      kind: depositoryAccounts.kind,
      label: depositoryAccounts.label,
      institutionName: depositoryAccounts.institutionName,
      accountMask: depositoryAccounts.accountMask,
      currency: depositoryAccounts.currency,
      currentBalance: depositoryAccounts.currentBalance,
      status: depositoryAccounts.status,
    })
    .from(depositoryAccounts)
    .where(
      and(
        eq(depositoryAccounts.userId, userId),
        eq(depositoryAccounts.status, "active"),
      ),
    )
    .orderBy(desc(depositoryAccounts.createdAt));

  return rows.map((row) => ({
    ...row,
    currentBalance: Number(row.currentBalance),
  }));
}
