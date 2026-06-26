import "server-only";

import { and, desc, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import {
  brokerageAccounts,
  brokerageConnections,
  investmentAccounts,
  plaidItems,
} from "@/db/schema/investment-accounts";
import { upsertPlaidBrokerageConnection } from "@/lib/brokerage/connections";
import type { BrokerageAccountHoldings } from "@/lib/brokerage/types";

const PLAID_PROVIDER = "plaid";

export type SavedBrokerageAccount = {
  id: string; // investment_accounts.id
  brokerageConnectionId: string | null;
  plaidItemId: string | null;
  externalAccountId: string | null;
  brokerage: string;
  accountType: string;
  label: string | null;
  institutionName: string | null;
  syncStatus: "idle" | "success" | "indexing" | "rate_limited" | "error";
  syncHttpStatus: number | null;
  syncErrorMessage: string | null;
};

// Maps a Plaid account_id to the investment_accounts.id we created for it, so
// the sync step knows where to write each account's holdings.
export type ItemAccountLink = {
  investmentAccountId: string;
  externalAccountId: string;
};

/**
 * Create one brokerage account per Plaid investment account under an Item.
 * Idempotent: reuses existing rows (matched by Plaid account_id) on re-link.
 * Returns the account_id → investmentAccountId mapping for the sync step.
 */
export async function saveBrokerageAccounts(
  userId: string,
  plaidItemId: string,
  brokerageLabel: string,
  accounts: BrokerageAccountHoldings[],
): Promise<ItemAccountLink[]> {
  const brokerageConnectionId = await upsertPlaidBrokerageConnection(plaidItemId);

  return db.transaction(async (tx) => {
    const links: ItemAccountLink[] = [];
    const currentExternalAccountIds = accounts.map(
      (account) => account.externalAccountId,
    );

    const staleAccounts = await tx
      .select({ id: brokerageAccounts.investmentAccountId })
      .from(brokerageAccounts)
      .innerJoin(
        investmentAccounts,
        eq(brokerageAccounts.investmentAccountId, investmentAccounts.id),
      )
      .where(
        and(
          eq(investmentAccounts.userId, userId),
          eq(brokerageAccounts.plaidItemId, plaidItemId),
          currentExternalAccountIds.length > 0
            ? notInArray(
                brokerageAccounts.externalAccountId,
                currentExternalAccountIds,
              )
            : undefined,
        ),
      );

    for (const account of staleAccounts) {
      await tx
        .delete(investmentAccounts)
        .where(eq(investmentAccounts.id, account.id));
    }

    for (const account of accounts) {
      // Reuse the existing investment account if we've seen this Plaid
      // account_id before (re-link), otherwise create it.
      const [existing] = await tx
        .select({ id: brokerageAccounts.investmentAccountId })
        .from(brokerageAccounts)
        .innerJoin(
          investmentAccounts,
          eq(brokerageAccounts.investmentAccountId, investmentAccounts.id),
        )
        .where(
          and(
            eq(investmentAccounts.userId, userId),
            eq(brokerageAccounts.externalAccountId, account.externalAccountId),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(brokerageAccounts)
          .set({
            brokerageConnectionId,
            plaidItemId,
            accountType: account.accountType,
          })
          .where(eq(brokerageAccounts.investmentAccountId, existing.id));
        links.push({
          investmentAccountId: existing.id,
          externalAccountId: account.externalAccountId,
        });
        continue;
      }

      const [created] = await tx
        .insert(investmentAccounts)
        .values({
          userId,
          kind: "brokerage",
          provider: PLAID_PROVIDER,
          label: account.accountName,
        })
        .returning({ id: investmentAccounts.id });

      await tx.insert(brokerageAccounts).values({
        investmentAccountId: created.id,
        brokerageConnectionId,
        plaidItemId,
        brokerage: brokerageLabel,
        accountType: account.accountType,
        externalAccountId: account.externalAccountId,
      });

      links.push({
        investmentAccountId: created.id,
        externalAccountId: account.externalAccountId,
      });
    }

    return links;
  });
}

export async function saveBrokerageConnectionAccounts(
  userId: string,
  brokerageConnectionId: string,
  provider: string,
  brokerageLabel: string,
  accounts: BrokerageAccountHoldings[],
): Promise<ItemAccountLink[]> {
  return db.transaction(async (tx) => {
    const links: ItemAccountLink[] = [];
    const currentExternalAccountIds = accounts.map(
      (account) => account.externalAccountId,
    );

    const staleAccounts = await tx
      .select({ id: brokerageAccounts.investmentAccountId })
      .from(brokerageAccounts)
      .innerJoin(
        investmentAccounts,
        eq(brokerageAccounts.investmentAccountId, investmentAccounts.id),
      )
      .where(
        and(
          eq(investmentAccounts.userId, userId),
          eq(brokerageAccounts.brokerageConnectionId, brokerageConnectionId),
          currentExternalAccountIds.length > 0
            ? notInArray(
                brokerageAccounts.externalAccountId,
                currentExternalAccountIds,
              )
            : undefined,
        ),
      );

    for (const account of staleAccounts) {
      await tx
        .delete(investmentAccounts)
        .where(eq(investmentAccounts.id, account.id));
    }

    for (const account of accounts) {
      const [existing] = await tx
        .select({ id: brokerageAccounts.investmentAccountId })
        .from(brokerageAccounts)
        .innerJoin(
          investmentAccounts,
          eq(brokerageAccounts.investmentAccountId, investmentAccounts.id),
        )
        .where(
          and(
            eq(investmentAccounts.userId, userId),
            eq(brokerageAccounts.brokerageConnectionId, brokerageConnectionId),
            eq(brokerageAccounts.externalAccountId, account.externalAccountId),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(investmentAccounts)
          .set({ label: account.accountName })
          .where(eq(investmentAccounts.id, existing.id));
        await tx
          .update(brokerageAccounts)
          .set({ accountType: account.accountType })
          .where(eq(brokerageAccounts.investmentAccountId, existing.id));
        links.push({
          investmentAccountId: existing.id,
          externalAccountId: account.externalAccountId,
        });
        continue;
      }

      const [created] = await tx
        .insert(investmentAccounts)
        .values({
          userId,
          kind: "brokerage",
          provider,
          label: account.accountName,
        })
        .returning({ id: investmentAccounts.id });

      await tx.insert(brokerageAccounts).values({
        investmentAccountId: created.id,
        brokerageConnectionId,
        brokerage: brokerageLabel,
        accountType: account.accountType,
        externalAccountId: account.externalAccountId,
      });

      links.push({
        investmentAccountId: created.id,
        externalAccountId: account.externalAccountId,
      });
    }

    return links;
  });
}

export async function getUserBrokerageAccounts(
  userId: string,
): Promise<SavedBrokerageAccount[]> {
  const rows = await db
    .select({
      id: investmentAccounts.id,
      brokerageConnectionId: brokerageAccounts.brokerageConnectionId,
      plaidItemId: brokerageAccounts.plaidItemId,
      externalAccountId: brokerageAccounts.externalAccountId,
      brokerage: brokerageAccounts.brokerage,
      accountType: brokerageAccounts.accountType,
      label: investmentAccounts.label,
      plaidInstitutionName: plaidItems.institutionName,
      connectionInstitutionName: brokerageConnections.institutionName,
      syncStatus: investmentAccounts.syncStatus,
      syncHttpStatus: investmentAccounts.syncHttpStatus,
      syncErrorMessage: investmentAccounts.syncErrorMessage,
    })
    .from(brokerageAccounts)
    .innerJoin(
      investmentAccounts,
      eq(brokerageAccounts.investmentAccountId, investmentAccounts.id),
    )
    .leftJoin(plaidItems, eq(brokerageAccounts.plaidItemId, plaidItems.id))
    .leftJoin(
      brokerageConnections,
      eq(brokerageAccounts.brokerageConnectionId, brokerageConnections.id),
    )
    .where(
      and(
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, "brokerage"),
        eq(investmentAccounts.status, "active"),
      ),
    )
    .orderBy(desc(investmentAccounts.createdAt));

  return rows.map((row) => ({
    ...row,
    institutionName: row.plaidInstitutionName ?? row.connectionInstitutionName,
  }));
}

export async function getItemAccountLinks(
  plaidItemId: string,
): Promise<ItemAccountLink[]> {
  const rows = await db
    .select({
      investmentAccountId: brokerageAccounts.investmentAccountId,
      externalAccountId: brokerageAccounts.externalAccountId,
    })
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.plaidItemId, plaidItemId));

  return rows.flatMap((row) =>
    row.externalAccountId
      ? [
          {
            investmentAccountId: row.investmentAccountId,
            externalAccountId: row.externalAccountId,
          },
        ]
      : [],
  );
}

export async function getConnectionAccountLinks(
  brokerageConnectionId: string,
): Promise<ItemAccountLink[]> {
  const rows = await db
    .select({
      investmentAccountId: brokerageAccounts.investmentAccountId,
      externalAccountId: brokerageAccounts.externalAccountId,
    })
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.brokerageConnectionId, brokerageConnectionId));

  return rows.flatMap((row) =>
    row.externalAccountId
      ? [
          {
            investmentAccountId: row.investmentAccountId,
            externalAccountId: row.externalAccountId,
          },
        ]
      : [],
  );
}
