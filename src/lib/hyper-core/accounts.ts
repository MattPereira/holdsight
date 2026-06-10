import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  financialAccounts,
  hyperCoreAccounts,
} from "@/db/schema/financial-accounts";
import type { SavedEvmAccount } from "@/lib/evm/accounts";

export type SavedHyperCoreAccount = {
  id: string;
  address: string;
  label: string | null;
};

export async function getUserHyperCoreAccounts(
  userId: string,
): Promise<SavedHyperCoreAccount[]> {
  return db
    .select({
      id: financialAccounts.id,
      address: hyperCoreAccounts.address,
      label: financialAccounts.label,
    })
    .from(hyperCoreAccounts)
    .innerJoin(
      financialAccounts,
      eq(hyperCoreAccounts.financialAccountId, financialAccounts.id),
    )
    .where(
      and(
        eq(hyperCoreAccounts.userId, userId),
        eq(financialAccounts.userId, userId),
        eq(financialAccounts.kind, "hyper_core"),
        eq(financialAccounts.status, "active"),
      ),
    )
    .orderBy(desc(financialAccounts.createdAt));
}

export async function ensureUserHyperCoreAccounts(
  userId: string,
  wallets: SavedEvmAccount[],
): Promise<SavedHyperCoreAccount[]> {
  const walletAddresses = new Set(wallets.map((wallet) => wallet.address));

  for (const wallet of wallets) {
    const [existing] = await db
      .select({ id: hyperCoreAccounts.financialAccountId })
      .from(hyperCoreAccounts)
      .innerJoin(
        financialAccounts,
        eq(hyperCoreAccounts.financialAccountId, financialAccounts.id),
      )
      .where(
        and(
          eq(hyperCoreAccounts.userId, userId),
          eq(hyperCoreAccounts.address, wallet.address),
          eq(financialAccounts.userId, userId),
          eq(financialAccounts.kind, "hyper_core"),
        ),
      )
      .limit(1);

    if (existing) continue;

    const financialAccountId = randomUUID();
    await db.batch([
      db.insert(financialAccounts).values({
        id: financialAccountId,
        userId,
        kind: "hyper_core",
        provider: "hyperliquid",
        label: wallet.label,
      }),
      db.insert(hyperCoreAccounts).values({
        financialAccountId,
        userId,
        address: wallet.address,
      }),
    ]);
  }

  const accounts = await getUserHyperCoreAccounts(userId);
  return accounts.filter((account) => walletAddresses.has(account.address));
}
