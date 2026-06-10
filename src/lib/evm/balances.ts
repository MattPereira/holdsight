import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  evmBalanceDetails,
  investmentBalances,
  investmentAccounts,
} from "@/db/schema/investment-accounts";
import { getUserEvmAccounts, type SavedEvmAccount } from "@/lib/evm/accounts";
import { getWalletBalances } from "@/lib/evm/client";
import type { InvestmentBalance, BalancesResult } from "@/lib/portfolio/types";

const ZERION_PROVIDER = "zerion";

function resultStatusToSyncStatus(
  status: BalancesResult["status"],
): "success" | "indexing" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

function balanceToRow(investmentAccountId: string, balance: InvestmentBalance) {
  return {
    investmentAccountId,
    sourceBalanceId: balance.sourceBalanceId,
    symbol: balance.symbol,
    name: balance.name,
    assetClass: "token" as const,
    amount: String(balance.amount),
    priceUsd: String(balance.priceUsd),
    valueUsd: String(balance.valueUsd),
  };
}

export async function replaceEvmAccountBalances(
  investmentAccountId: string,
  result: BalancesResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: ZERION_PROVIDER,
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

    const insertedBalances = await tx
      .insert(investmentBalances)
      .values(
        result.balances.map((balance) =>
          balanceToRow(investmentAccountId, balance),
        ),
      )
      .returning({ id: investmentBalances.id });

    const details = insertedBalances.map((balance, index) => ({
      balanceId: balance.id,
      chainId: result.balances[index]?.chainId ?? "unknown",
      contractAddress: result.balances[index]?.contractAddress,
    }));

    if (details.length > 0) {
      await tx.insert(evmBalanceDetails).values(details);
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
  chainId: string | null;
  contractAddress: string | null;
}): InvestmentBalance {
  return {
    sourceBalanceId: row.sourceBalanceId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    chainId: row.chainId ?? "unknown",
    contractAddress: row.contractAddress ?? undefined,
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  };
}

export async function getCurrentEvmBalances(
  userId: string,
): Promise<BalancesResult[]> {
  const wallets = await getUserEvmAccounts(userId);
  const results: BalancesResult[] = [];

  for (const wallet of wallets) {
    if (wallet.syncStatus === "idle") {
      results.push({
        status: "ready",
        address: wallet.address,
        balances: [],
      });
      continue;
    }

    if (wallet.syncStatus === "indexing" || wallet.syncStatus === "rate_limited") {
      results.push({ status: wallet.syncStatus, address: wallet.address });
      continue;
    }

    if (wallet.syncStatus === "error") {
      results.push({
        status: "error",
        address: wallet.address,
        message: wallet.syncErrorMessage ?? "Balance sync failed.",
        httpStatus: wallet.syncHttpStatus ?? 502,
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
        chainId: evmBalanceDetails.chainId,
        contractAddress: evmBalanceDetails.contractAddress,
      })
      .from(investmentBalances)
      .leftJoin(
        evmBalanceDetails,
        eq(evmBalanceDetails.balanceId, investmentBalances.id),
      )
      .where(eq(investmentBalances.investmentAccountId, wallet.id))
      .orderBy(desc(investmentBalances.valueUsd));

    results.push({
      status: "ready",
      address: wallet.address,
      balances: balances.map(toInvestmentBalance),
    });
  }

  return results;
}

/**
 * Fetch EVM balances for every tracked wallet. Called from the client only on
 * a button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially so we never burst past the per-second rate
 * limit. If we get rate limited, we stop immediately rather than spending more
 * of the limited daily quota on calls that would also fail.
 */
export async function syncEvmWalletBalances(
  wallets: SavedEvmAccount[],
): Promise<void> {
  for (const wallet of wallets) {
    const result = await getWalletBalances(wallet.address);
    await replaceEvmAccountBalances(wallet.id, result);
    if (result.status === "rate_limited") break;
  }
}
