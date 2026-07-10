import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts, lighterAccounts } from "@/db/schema/investment-accounts";
import { getLighterToken, type SavedLighterAccount } from "@/lib/lighter/accounts";
import { fetchLighterAccount } from "@/lib/lighter/client";
import type { BalancesResult, InvestmentBalance } from "@/lib/portfolio/types";
import {
  readPersistedWalletBalances,
  replaceWalletFamilyAccountBalances,
} from "@/lib/wallets/balance-family";

const LIGHTER_DEFAULT_ERROR = "Lighter balance sync failed.";

function httpStatus(error: unknown): number {
  return error instanceof Error && "httpStatus" in error
    ? Number(error.httpStatus) || 502
    : 502;
}

async function fetchLighterBalances(
  userId: string,
  account: SavedLighterAccount,
): Promise<BalancesResult> {
  try {
    const token = await getLighterToken(userId, account.id);
    if (!token) throw new Error("Lighter read-only token is missing.");
    const snapshot = await fetchLighterAccount(account.accountIndex, token);
    return { status: "ready", address: account.address, balances: snapshot.balances };
  } catch (error) {
    const status = httpStatus(error);
    if (status === 429) return { status: "rate_limited", address: account.address };
    return {
      status: "error",
      address: account.address,
      message: error instanceof Error ? error.message : LIGHTER_DEFAULT_ERROR,
      httpStatus: status,
    };
  }
}

export async function syncLighterAccounts(
  userId: string,
  accounts: SavedLighterAccount[],
): Promise<void> {
  for (const account of accounts) {
    const result = await fetchLighterBalances(userId, account);
    await replaceWalletFamilyAccountBalances(account.id, result, {
      syncProvider: "lighter",
      assetClass: (balance) =>
        balance.symbol.toUpperCase().includes("USD") ? "cash" : "token",
    });
    if (result.status === "rate_limited") break;
  }
}

function accountBalances(accountId: string): Promise<InvestmentBalance[]> {
  return readPersistedWalletBalances(accountId, { chainId: "lighter" });
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
        message: failure.syncErrorMessage ?? LIGHTER_DEFAULT_ERROR,
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
