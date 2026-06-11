import "server-only";

import { getCurrentEvmBalances } from "@/lib/evm/balances";
import { getUserEvmAccounts, type SavedEvmAccount } from "@/lib/evm/accounts";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreBalances } from "@/lib/hyper-core/balances";
import type { BalancesResult } from "@/lib/portfolio/types";

function addressKey(address: string): string {
  return address.trim().toLowerCase();
}

function mergeReadyResults(
  current: Extract<BalancesResult, { status: "ready" }>,
  next: Extract<BalancesResult, { status: "ready" }>,
): BalancesResult {
  return {
    ...current,
    balances: [...current.balances, ...next.balances].sort(
      (a, b) => b.valueUsd - a.valueUsd,
    ),
  };
}

export function mergeOnChainBalanceResults(
  evmResults: BalancesResult[],
  hyperCoreResults: BalancesResult[],
): BalancesResult[] {
  const merged = new Map<string, BalancesResult>();

  for (const result of evmResults) {
    merged.set(addressKey(result.address), result);
  }

  for (const result of hyperCoreResults) {
    const key = addressKey(result.address);
    const current = merged.get(key);

    if (!current) {
      merged.set(key, result);
      continue;
    }

    if (current.status === "ready" && result.status === "ready") {
      merged.set(key, mergeReadyResults(current, result));
    } else if (current.status !== "ready" && result.status === "ready") {
      merged.set(key, result);
    }
  }

  return Array.from(merged.values());
}

export async function getCurrentOnChainBalances(
  userId: string,
  wallets?: SavedEvmAccount[],
): Promise<BalancesResult[]> {
  const evmAccounts = wallets ?? (await getUserEvmAccounts(userId));
  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(
    userId,
    evmAccounts,
  );
  const [evmResults, hyperCoreResults] = await Promise.all([
    getCurrentEvmBalances(userId),
    getCurrentHyperCoreBalances(hyperCoreAccounts),
  ]);

  return mergeOnChainBalanceResults(evmResults, hyperCoreResults);
}
