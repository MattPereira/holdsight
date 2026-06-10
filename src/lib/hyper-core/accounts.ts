import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentAccounts,
  hyperCoreAccounts,
} from "@/db/schema/investment-accounts";
import type { SavedEvmAccount } from "@/lib/evm/accounts";

export type SavedHyperCoreAccount = {
  id: string;
  address: string;
  label: string | null;
  syncStatus: "idle" | "success" | "indexing" | "rate_limited" | "error";
  syncHttpStatus: number | null;
  syncErrorMessage: string | null;
};

export async function getUserHyperCoreAccounts(
  userId: string,
): Promise<SavedHyperCoreAccount[]> {
  return db
    .select({
      id: investmentAccounts.id,
      address: hyperCoreAccounts.address,
      label: investmentAccounts.label,
      syncStatus: investmentAccounts.syncStatus,
      syncHttpStatus: investmentAccounts.syncHttpStatus,
      syncErrorMessage: investmentAccounts.syncErrorMessage,
    })
    .from(hyperCoreAccounts)
    .innerJoin(
      investmentAccounts,
      eq(hyperCoreAccounts.investmentAccountId, investmentAccounts.id),
    )
    .where(
      and(
        eq(hyperCoreAccounts.userId, userId),
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, "hyper_core"),
        eq(investmentAccounts.status, "active"),
      ),
    )
    .orderBy(desc(investmentAccounts.createdAt));
}

export async function ensureUserHyperCoreAccounts(
  userId: string,
  wallets: SavedEvmAccount[],
): Promise<SavedHyperCoreAccount[]> {
  const walletAddresses = new Set(wallets.map((wallet) => wallet.address));

  for (const wallet of wallets) {
    const [existing] = await db
      .select({ id: hyperCoreAccounts.investmentAccountId })
      .from(hyperCoreAccounts)
      .innerJoin(
        investmentAccounts,
        eq(hyperCoreAccounts.investmentAccountId, investmentAccounts.id),
      )
      .where(
        and(
          eq(hyperCoreAccounts.userId, userId),
          eq(hyperCoreAccounts.address, wallet.address),
          eq(investmentAccounts.userId, userId),
          eq(investmentAccounts.kind, "hyper_core"),
        ),
      )
      .limit(1);

    if (existing) continue;

    const investmentAccountId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(investmentAccounts).values({
        id: investmentAccountId,
        userId,
        kind: "hyper_core",
        provider: "hyperliquid",
        label: wallet.label,
      });

      await tx.insert(hyperCoreAccounts).values({
        investmentAccountId,
        userId,
        address: wallet.address,
      });
    });
  }

  const accounts = await getUserHyperCoreAccounts(userId);
  return accounts.filter((account) => walletAddresses.has(account.address));
}
