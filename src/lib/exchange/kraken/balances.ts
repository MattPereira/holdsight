import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentAccounts,
  investmentBalances,
} from "@/db/schema/investment-accounts";
import {
  ensureUserKrakenAccount,
  getUserKrakenAccounts,
  getUserKrakenCredentials,
  type SavedKrakenAccount,
} from "@/lib/exchange/kraken/accounts";
import {
  fetchKrakenBalances,
  type KrakenBalance,
  type KrakenBalancesResult,
} from "@/lib/exchange/kraken/client";
import type { InvestmentBalance, BalancesResult } from "@/lib/portfolio/types";

const KRAKEN_PROVIDER = "kraken";

function resultStatusToSyncStatus(
  status: KrakenBalancesResult["status"],
): "success" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function balanceToRow(investmentAccountId: string, balance: KrakenBalance) {
  return {
    investmentAccountId,
    sourceBalanceId: balance.sourceBalanceId,
    symbol: balance.symbol,
    name: balance.name,
    assetClass: balance.assetClass,
    amount: String(balance.amount),
    priceUsd: String(balance.priceUsd),
    valueUsd: String(balance.valueUsd),
  };
}

export async function replaceKrakenAccountBalances(
  investmentAccountId: string,
  result: KrakenBalancesResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: KRAKEN_PROVIDER,
        syncStatus: resultStatusToSyncStatus(result.status),
        syncHttpStatus: result.status === "error" ? result.httpStatus : null,
        syncErrorMessage: result.status === "error" ? result.message : null,
        lastSyncedAt: new Date(),
      })
      .where(eq(investmentAccounts.id, investmentAccountId));

    if (result.status !== "ready") return;

    await tx
      .delete(investmentBalances)
      .where(eq(investmentBalances.investmentAccountId, investmentAccountId));

    if (result.balances.length === 0) return;

    await tx
      .insert(investmentBalances)
      .values(
        result.balances.map((balance) =>
          balanceToRow(investmentAccountId, balance),
        ),
      );
  });
}

function toInvestmentBalance(row: {
  sourceBalanceId: string | null;
  symbol: string;
  name: string | null;
  amount: string;
  priceUsd: string;
  valueUsd: string;
}): InvestmentBalance {
  return {
    sourceBalanceId: row.sourceBalanceId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    chainId: "kraken",
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  };
}

export async function getCurrentKrakenBalances(
  accounts: SavedKrakenAccount[],
): Promise<BalancesResult[]> {
  const results: BalancesResult[] = [];

  for (const account of accounts) {
    const address = account.label ?? "Kraken";

    if (account.syncStatus === "idle") {
      results.push({ status: "ready", address, balances: [] });
      continue;
    }

    if (account.syncStatus === "indexing" || account.syncStatus === "rate_limited") {
      results.push({ status: account.syncStatus, address });
      continue;
    }

    if (account.syncStatus === "error") {
      results.push({
        status: "error",
        address,
        message: account.syncErrorMessage ?? "Kraken balance sync failed.",
        httpStatus: account.syncHttpStatus ?? 502,
      });
      continue;
    }

    const balances = await db
      .select({
        sourceBalanceId: investmentBalances.sourceBalanceId,
        symbol: investmentBalances.symbol,
        name: investmentBalances.name,
        amount: investmentBalances.amount,
        priceUsd: investmentBalances.priceUsd,
        valueUsd: investmentBalances.valueUsd,
      })
      .from(investmentBalances)
      .where(eq(investmentBalances.investmentAccountId, account.id))
      .orderBy(desc(investmentBalances.valueUsd));

    results.push({
      status: "ready",
      address,
      balances: balances.map(toInvestmentBalance),
    });
  }

  return results;
}

export async function getCurrentUserKrakenBalances(
  userId: string,
): Promise<BalancesResult[]> {
  const accounts = await getUserKrakenAccounts(userId);
  return getCurrentKrakenBalances(accounts);
}

export async function syncKrakenAccounts(
  userId: string,
  accounts: SavedKrakenAccount[],
): Promise<void> {
  for (const account of accounts) {
    const credentials = await getUserKrakenCredentials(userId, account.id);
    if (!credentials) {
      await replaceKrakenAccountBalances(account.id, {
        status: "error",
        address: account.label ?? "Kraken",
        message: "Add Kraken API credentials before syncing.",
        httpStatus: 400,
      });
      continue;
    }

    const result = await fetchKrakenBalances(credentials);
    await replaceKrakenAccountBalances(account.id, result);
    if (result.status === "rate_limited") break;
  }
}

export async function syncUserKrakenAccounts(userId: string): Promise<void> {
  const accounts = await ensureUserKrakenAccount(userId);
  await syncKrakenAccounts(userId, accounts);
}
