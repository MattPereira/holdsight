"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";

import {
  investmentBalancesView,
  type BalancesView
} from "@/lib/accounts/balances-view";
import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  getUserEvmAccounts,
  validateUserEvmAccounts
} from "@/lib/evm/accounts";
import {
  getCurrentEvmBalances,
  syncEvmWalletBalances,
} from "@/lib/evm/balances";
import { ensureUserHyperCoreAccounts, getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import {
  getCurrentHyperCoreBalances,
  syncHyperCoreAccounts,
} from "@/lib/hyper-core/balances";
import {
  claimInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease
} from "@/lib/investment-transactions/ingestion";
import {
  getUserLighterAccounts
} from "@/lib/lighter/accounts";
import {
  getCurrentLighterBalances,
  syncLighterAccounts,
} from "@/lib/lighter/balances";
import type { BalancesResult } from "@/lib/portfolio/types";
import { mergeWalletBalanceResults } from "@/lib/wallets/balances";
import {
  getCurrentWalletTransactions,
  getWalletTransactionHistoryStatus,
  type WalletTransactionHistoryStatus,
} from "@/lib/wallets/transactions";
import { syncEvmTransactionHistory } from "@/workflows/evm-transaction-sync";
import { syncHyperCoreTransactionHistory } from "@/workflows/hyper-core-transaction-sync";
import { syncLighterTransactionHistory } from "@/workflows/lighter-transaction-sync";

function unauthorizedBalancesResult(): BalancesResult[] {
  return [
    {
      status: "error",
      address: "AUTH",
      message: "You must be signed in to view balances.",
      httpStatus: 401,
    },
  ];
}

/**
 * Fetch EVM balances for every tracked wallet. Called from the client only on
 * a button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially (not in parallel) so we never burst past the
 * per-second rate limit. If we get rate limited, we stop immediately rather than
 * spending more of the limited daily quota on calls that would also fail.
 */
export async function loadEvmBalances(): Promise<BalancesResult[]> {
  // Privacy-first: no portfolio data leaves the server without a valid session.
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) return unauthorizedBalancesResult();

  const walletConfigError = await validateUserEvmAccounts(userId);
  if (walletConfigError) {
    return [
      {
        status: "error",
        address: "WALLETS",
        message: walletConfigError,
        httpStatus: 400,
      },
    ];
  }

  const wallets = await getUserEvmAccounts(userId);
  await syncEvmWalletBalances(wallets);

  return getCurrentEvmBalances(userId);
}

export async function loadHyperCoreBalances(): Promise<BalancesResult[]> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) return unauthorizedBalancesResult();

  const walletConfigError = await validateUserEvmAccounts(userId);
  if (walletConfigError) {
    return [
      {
        status: "error",
        address: "WALLETS",
        message: walletConfigError,
        httpStatus: 400,
      },
    ];
  }

  const wallets = await getUserEvmAccounts(userId);
  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);

  return getCurrentHyperCoreBalances(hyperCoreAccounts);
}

export async function loadWalletBalances(): Promise<BalancesView> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) return investmentBalancesView(unauthorizedBalancesResult());

  const walletConfigError = await validateUserEvmAccounts(userId);
  if (walletConfigError) {
    return investmentBalancesView([
      {
        status: "error",
        address: "WALLETS",
        message: walletConfigError,
        httpStatus: 400,
      },
    ]);
  }

  const wallets = await getUserEvmAccounts(userId);
  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
  const lighterAccounts = await getUserLighterAccounts(userId);
  await syncEvmWalletBalances(wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);
  await syncLighterAccounts(userId, lighterAccounts);

  const [evmResults, hyperCoreResults, lighterResults] = await Promise.all([
    getCurrentEvmBalances(userId),
    getCurrentHyperCoreBalances(hyperCoreAccounts),
    getCurrentLighterBalances(lighterAccounts),
  ]);

  return investmentBalancesView(
    mergeWalletBalanceResults(evmResults, hyperCoreResults, lighterResults),
  );
}

export type WalletTransactionsActionResult = {
  transactions: Awaited<ReturnType<typeof getCurrentWalletTransactions>> | null;
  message: string;
  error: string | null;
  historyStatus: WalletTransactionHistoryStatus;
};

export async function loadWalletTransactions(): Promise<WalletTransactionsActionResult> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      historyStatus: { transactionCount: 0, earliestTransactionAt: null, latestTransactionAt: null, latestTransactionUpdatedAt: null, hasMore: false, phase: "up_to_date" },
    };
  }

  const wallets = await getUserEvmAccounts(userId);
  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
  const lighterAccounts = await getUserLighterAccounts(userId);
  if (wallets.length === 0) {
    return {
      transactions: [],
      message: "",
      error: "Add at least one wallet before syncing transactions.",
      historyStatus: { transactionCount: 0, earliestTransactionAt: null, latestTransactionAt: null, latestTransactionUpdatedAt: null, hasMore: false, phase: "up_to_date" },
    };
  }

  try {
    let queuedHyperCoreAccountCount = 0;
    for (const account of hyperCoreAccounts) {
      const leaseToken = randomUUID();
      const claimed = await claimInvestmentTransactionSyncLease({
        userId,
        investmentAccountId: account.id,
        provider: "hyperliquid",
        leaseToken,
      });
      if (!claimed) continue;

      try {
        await start(syncHyperCoreTransactionHistory, [userId, account.id, leaseToken]);
        queuedHyperCoreAccountCount += 1;
      } catch (error) {
        await releaseInvestmentTransactionSyncLease({
          userId,
          investmentAccountId: account.id,
          provider: "hyperliquid",
          leaseToken,
        });
        throw error;
      }
    }

    let queuedLighterAccountCount = 0;
    for (const account of lighterAccounts) {
      const leaseToken = randomUUID();
      const claimed = await claimInvestmentTransactionSyncLease({
        userId, investmentAccountId: account.id, provider: "lighter", leaseToken,
      });
      if (!claimed) continue;
      try {
        await start(syncLighterTransactionHistory, [userId, account.id, leaseToken]);
        queuedLighterAccountCount += 1;
      } catch (error) {
        await releaseInvestmentTransactionSyncLease({
          userId, investmentAccountId: account.id, provider: "lighter", leaseToken,
        });
        throw error;
      }
    }

    const evmWorkflowAccounts: Array<{ id: string; leaseToken: string; }> = [];
    for (const account of wallets) {
      const leaseToken = randomUUID();
      const claimed = await claimInvestmentTransactionSyncLease({
        userId, investmentAccountId: account.id, provider: "zerion", leaseToken,
      });
      if (claimed) evmWorkflowAccounts.push({ id: account.id, leaseToken });
    }
    if (evmWorkflowAccounts.length > 0) {
      try {
        await start(syncEvmTransactionHistory, [userId, evmWorkflowAccounts]);
      } catch (error) {
        await Promise.all(evmWorkflowAccounts.map(({ id, leaseToken }) =>
          releaseInvestmentTransactionSyncLease({ userId, investmentAccountId: id, provider: "zerion", leaseToken }),
        ));
        throw error;
      }
    }

    revalidatePath("/wallets");
    const [transactions, historyStatus] = await Promise.all([
      getCurrentWalletTransactions(userId),
      getWalletTransactionHistoryStatus(userId, wallets, hyperCoreAccounts, lighterAccounts),
    ]);
    const messages = [
      queuedHyperCoreAccountCount > 0
        ? `Queued HyperCore history for ${queuedHyperCoreAccountCount} ${queuedHyperCoreAccountCount === 1 ? "wallet" : "wallets"}.`
        : null,
      queuedLighterAccountCount > 0
        ? `Queued Lighter history for ${queuedLighterAccountCount} ${queuedLighterAccountCount === 1 ? "account" : "accounts"}.`
        : null,
      evmWorkflowAccounts.length > 0
        ? `Queued EVM history for ${evmWorkflowAccounts.length} ${evmWorkflowAccounts.length === 1 ? "wallet" : "wallets"}.`
        : null,
    ].filter(Boolean);
    return {
      transactions,
      message: messages.join(" ") || "Transaction history sync is already running.",
      error: null,
      historyStatus,
    };
  } catch (error) {
    const [transactions, historyStatus] = await Promise.all([
      getCurrentWalletTransactions(userId),
      getWalletTransactionHistoryStatus(userId, wallets, hyperCoreAccounts, lighterAccounts),
    ]);
    return {
      transactions,
      message: "",
      error: error instanceof Error ? error.message : "Failed to refresh wallet transactions.",
      historyStatus,
    };
  }
}

/**
 * Read-only snapshot of wallet transactions for polling an in-progress sync.
 * Unlike loadWalletTransactions it never claims leases, starts workflows, or
 * revalidates — it only reads the latest rows and sync status.
 */
export async function pollWalletTransactions(
  knownTransactionCount = 0,
  knownLatestTransactionUpdatedAt: string | null = null,
): Promise<WalletTransactionsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      transactions: null,
      message: "",
      error: "You must be signed in to refresh transactions.",
      historyStatus: { transactionCount: 0, earliestTransactionAt: null, latestTransactionAt: null, latestTransactionUpdatedAt: null, hasMore: false, phase: "up_to_date" },
    };
  }

  const [wallets, hyperCoreAccounts, lighterAccounts] = await Promise.all([
    getUserEvmAccounts(userId),
    getUserHyperCoreAccounts(userId),
    getUserLighterAccounts(userId),
  ]);
  const historyStatus = await getWalletTransactionHistoryStatus(
    userId,
    wallets,
    hyperCoreAccounts,
    lighterAccounts,
  );
  const transactions =
    historyStatus.transactionCount === knownTransactionCount &&
      historyStatus.latestTransactionUpdatedAt === knownLatestTransactionUpdatedAt
      ? null
      : await getCurrentWalletTransactions(userId);
  return { transactions, message: "", error: null, historyStatus };
}
