import "server-only";

import { getCurrentEvmBalances } from "@/lib/evm/balances";
import { getUserEvmAccounts, type SavedEvmAccount } from "@/lib/evm/accounts";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreBalances } from "@/lib/hyper-core/balances";
import { getUserLighterAccounts } from "@/lib/lighter/accounts";
import { getCurrentLighterBalances } from "@/lib/lighter/balances";
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

export function mergeWalletBalanceResults(
  ...resultGroups: BalancesResult[][]
): BalancesResult[] {
  const merged = new Map<string, BalancesResult>();

  for (const result of resultGroups.flat()) {
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

export async function getCurrentWalletBalances(
  userId: string,
  wallets?: SavedEvmAccount[],
): Promise<BalancesResult[]> {
  const evmAccounts = wallets ?? (await getUserEvmAccounts(userId));
  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(
    userId,
    evmAccounts,
  );
  const lighterAccounts = await getUserLighterAccounts(userId);
  const [evmResults, hyperCoreResults, lighterResults] = await Promise.all([
    getCurrentEvmBalances(userId),
    getCurrentHyperCoreBalances(hyperCoreAccounts),
    getCurrentLighterBalances(lighterAccounts),
  ]);

  return mergeWalletBalanceResults(evmResults, hyperCoreResults, lighterResults);
}
