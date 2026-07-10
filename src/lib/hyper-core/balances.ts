import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  hyperCoreBalanceDetails,
  investmentAccounts,
  investmentBalances,
} from "@/db/schema/investment-accounts";
import type { HyperCoreBalancesResult } from "@/lib/hyper-core/client";
import {
  fetchHyperCoreBalances,
  getHyperCoreSpotMarketData,
} from "@/lib/hyper-core/client";
import type { BalancesResult, InvestmentBalance } from "@/lib/portfolio/types";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";
import {
  getCurrentWalletFamilyBalances,
  replaceWalletFamilyAccountBalances,
  toInvestmentBalance,
} from "@/lib/wallets/balance-family";

const HYPERLIQUID_PROVIDER = "hyperliquid";

export async function replaceHyperCoreAccountBalances(
  investmentAccountId: string,
  result: HyperCoreBalancesResult,
): Promise<void> {
  await replaceWalletFamilyAccountBalances(investmentAccountId, result, {
    syncProvider: HYPERLIQUID_PROVIDER,
    assetClass: (balance) => balance.assetClass,
    insertDetails: async (tx, inserted, balances) => {
      const balanceDetails = inserted.map((balance, index) => ({
        balanceId: balance.id,
        balanceType: balances[index]?.balanceType ?? "spot",
      }));
      await tx.insert(hyperCoreBalanceDetails).values(balanceDetails);
    },
  });
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

  return balances.map((row) => toInvestmentBalance(row, "hypercore"));
}

export async function getCurrentHyperCoreBalances(
  accounts: SavedHyperCoreAccount[],
): Promise<BalancesResult[]> {
  return getCurrentWalletFamilyBalances(accounts, {
    chainId: "hypercore",
    defaultErrorMessage: "HyperCore balance sync failed.",
  });
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
