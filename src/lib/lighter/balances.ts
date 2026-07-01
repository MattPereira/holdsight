import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts, investmentBalances, lighterAccounts } from "@/db/schema/investment-accounts";
import { getLighterToken, type SavedLighterAccount } from "@/lib/lighter/accounts";
import { fetchLighterAccount } from "@/lib/lighter/client";
import type { BalancesResult, InvestmentBalance } from "@/lib/portfolio/types";

function httpStatus(error: unknown): number {
  return error instanceof Error && "httpStatus" in error
    ? Number(error.httpStatus) || 502
    : 502;
}

export async function syncLighterAccounts(
  userId: string,
  accounts: SavedLighterAccount[],
): Promise<void> {
  for (const account of accounts) {
    try {
      const token = await getLighterToken(userId, account.id);
      if (!token) throw new Error("Lighter read-only token is missing.");
      const snapshot = await fetchLighterAccount(account.accountIndex, token);
      await db.transaction(async (tx) => {
        await tx.update(investmentAccounts).set({
          syncProvider: "lighter",
          syncStatus: "success",
          syncHttpStatus: null,
          syncErrorMessage: null,
          lastSyncedAt: new Date(),
        }).where(eq(investmentAccounts.id, account.id));
        await tx.delete(investmentBalances).where(
          eq(investmentBalances.investmentAccountId, account.id),
        );
        if (snapshot.balances.length > 0) {
          await tx.insert(investmentBalances).values(snapshot.balances.map((balance) => ({
            investmentAccountId: account.id,
            sourceBalanceId: balance.sourceBalanceId,
            symbol: balance.symbol,
            name: balance.name,
            assetClass: balance.symbol.toUpperCase().includes("USD") ? "cash" as const : "token" as const,
            amount: String(balance.amount),
            priceUsd: String(balance.priceUsd),
            valueUsd: String(balance.valueUsd),
          })));
        }
      });
    } catch (error) {
      const status = httpStatus(error);
      await db.update(investmentAccounts).set({
        syncProvider: "lighter",
        syncStatus: status === 429 ? "rate_limited" : "error",
        syncHttpStatus: status,
        syncErrorMessage: error instanceof Error ? error.message : "Lighter balance sync failed.",
        lastSyncedAt: new Date(),
      }).where(eq(investmentAccounts.id, account.id));
      if (status === 429) break;
    }
  }
}

async function accountBalances(accountId: string): Promise<InvestmentBalance[]> {
  const rows = await db.select({
    sourceBalanceId: investmentBalances.sourceBalanceId,
    symbol: investmentBalances.symbol,
    name: investmentBalances.name,
    amount: investmentBalances.amount,
    priceUsd: investmentBalances.priceUsd,
    valueUsd: investmentBalances.valueUsd,
  }).from(investmentBalances).where(
    eq(investmentBalances.investmentAccountId, accountId),
  ).orderBy(desc(investmentBalances.valueUsd));
  return rows.map((row) => ({
    sourceBalanceId: row.sourceBalanceId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    chainId: "lighter",
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  }));
}

export async function getCurrentLighterBalances(
  accounts: SavedLighterAccount[],
): Promise<BalancesResult[]> {
  const byAddress = new Map<string, SavedLighterAccount[]>();
  for (const account of accounts) {
    byAddress.set(account.address, [...(byAddress.get(account.address) ?? []), account]);
  }
  const results: BalancesResult[] = [];
  for (const [address, addressAccounts] of byAddress) {
    const failure = addressAccounts.find((account) => account.syncStatus === "error");
    if (failure) {
      results.push({
        status: "error",
        address,
        message: failure.syncErrorMessage ?? "Lighter balance sync failed.",
        httpStatus: failure.syncHttpStatus ?? 502,
      });
      continue;
    }
    if (addressAccounts.some((account) => account.syncStatus === "rate_limited")) {
      results.push({ status: "rate_limited", address });
      continue;
    }
    const balances = (await Promise.all(addressAccounts.map((account) => accountBalances(account.id))))
      .flat().sort((a, b) => b.valueUsd - a.valueUsd);
    results.push({ status: "ready", address, balances });
  }
  return results;
}

export async function getCurrentLighterBalancesForEvmAccount(
  userId: string,
  evmInvestmentAccountId: string,
): Promise<InvestmentBalance[]> {
  const accounts = await db.select({ id: investmentAccounts.id })
    .from(investmentAccounts)
    .innerJoin(
      lighterAccounts,
      eq(lighterAccounts.investmentAccountId, investmentAccounts.id),
    ).where(and(
      eq(investmentAccounts.userId, userId),
      eq(lighterAccounts.evmInvestmentAccountId, evmInvestmentAccountId),
    ));
  return (await Promise.all(accounts.map((account) => accountBalances(account.id)))).flat();
}
