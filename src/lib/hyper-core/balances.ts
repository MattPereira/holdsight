import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  hyperCoreBalanceDetails,
  investmentAccounts,
  investmentBalances,
} from "@/db/schema/investment-accounts";
import type {
  HyperCoreBalance,
  HyperCoreBalancesResult,
} from "@/lib/hyper-core/client";
import {
  fetchHyperCoreBalances,
  getHyperCoreSpotMarketData,
} from "@/lib/hyper-core/client";
import type { InvestmentBalance, BalancesResult } from "@/lib/portfolio/types";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";

const HYPERLIQUID_PROVIDER = "hyperliquid";

function resultStatusToSyncStatus(
  status: HyperCoreBalancesResult["status"],
): "success" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function balanceToRow(investmentAccountId: string, balance: HyperCoreBalance) {
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

export async function replaceHyperCoreAccountBalances(
  investmentAccountId: string,
  result: HyperCoreBalancesResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: HYPERLIQUID_PROVIDER,
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

    if (result.balances.length > 0) {
      const insertedBalances = await tx
        .insert(investmentBalances)
        .values(
          result.balances.map((balance) =>
            balanceToRow(investmentAccountId, balance),
          ),
        )
        .returning({ id: investmentBalances.id });

      const balanceDetails = insertedBalances.map((balance, index) => ({
        balanceId: balance.id,
        balanceType: result.balances[index]?.balanceType ?? "spot",
      }));

      await tx.insert(hyperCoreBalanceDetails).values(balanceDetails);
    }
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
    chainId: "hypercore",
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  };
}

export async function getCurrentHyperCoreSpotBalancesByAccountId(
  investmentAccountId: string,
): Promise<InvestmentBalance[]> {
  const [account] = await db
    .select({
      syncStatus: investmentAccounts.syncStatus,
    })
    .from(investmentAccounts)
    .where(eq(investmentAccounts.id, investmentAccountId))
    .limit(1);

  if (!account || account.syncStatus !== "success") return [];

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
    .where(
      and(
        eq(investmentBalances.investmentAccountId, investmentAccountId),
        inArray(investmentBalances.assetClass, ["token", "cash"]),
      ),
    )
    .orderBy(desc(investmentBalances.valueUsd));

  return balances.map(toInvestmentBalance);
}

export async function getCurrentHyperCoreBalances(
  accounts: SavedHyperCoreAccount[],
): Promise<BalancesResult[]> {
  const results: BalancesResult[] = [];

  for (const account of accounts) {
    if (account.syncStatus === "idle") {
      results.push({
        status: "ready",
        address: account.address,
        balances: [],
      });
      continue;
    }

    if (account.syncStatus === "indexing" || account.syncStatus === "rate_limited") {
      results.push({ status: account.syncStatus, address: account.address });
      continue;
    }

    if (account.syncStatus === "error") {
      results.push({
        status: "error",
        address: account.address,
        message: account.syncErrorMessage ?? "HyperCore balance sync failed.",
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
      address: account.address,
      balances: balances.map(toInvestmentBalance),
    });
  }

  return results;
}

export async function syncHyperCoreAccounts(
  accounts: SavedHyperCoreAccount[],
): Promise<void> {
  if (accounts.length === 0) return;

  let spotMarketData: Awaited<ReturnType<typeof getHyperCoreSpotMarketData>>;
  try {
    spotMarketData = await getHyperCoreSpotMarketData();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Hyperliquid spot market data error";

    for (const account of accounts) {
      await replaceHyperCoreAccountBalances(account.id, {
        status: "error",
        address: account.address,
        message,
        httpStatus: 502,
      });
    }
    return;
  }

  for (const account of accounts) {
    const result = await fetchHyperCoreBalances(
      account.address,
      spotMarketData,
    );
    await replaceHyperCoreAccountBalances(account.id, result);
    if (result.status === "rate_limited") break;
  }
}
