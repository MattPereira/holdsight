import "server-only";

import { portfolioProviderRegistry } from "@/lib/portfolio/providers/registry";
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

/**
 * Merges balance results that share a wallet address into one row per
 * address. Kept here for `app/actions.ts`'s wallet-refresh action, which
 * still assembles its own EVM/HyperCore/Lighter results directly rather than
 * going through the registry (it needs to trigger each source's sync before
 * reading, not just read).
 */
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
): Promise<BalancesResult[]> {
  return portfolioProviderRegistry.getWalletBalances(userId);
}
