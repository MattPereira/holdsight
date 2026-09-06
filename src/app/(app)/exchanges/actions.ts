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
  ensureUserKrakenAccount,
  getUserKrakenAccounts
} from "@/lib/exchange/kraken/accounts";
import {
  getCurrentUserKrakenBalances,
  syncKrakenAccounts,
} from "@/lib/exchange/kraken/balances";
import {
  getCurrentKrakenTransactions,
  getKrakenTransactionHistoryStatus,
  type CurrentKrakenTransaction,
  type KrakenTransactionHistoryStatus,
} from "@/lib/exchange/kraken/transactions";
import {
  claimInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease
} from "@/lib/investment-transactions/ingestion";
import type { BalancesResult } from "@/lib/portfolio/types";
import { syncKrakenTransactionHistory } from "@/workflows/kraken-transaction-sync";


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


export async function loadKrakenBalances(): Promise<BalancesView> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) return investmentBalancesView(unauthorizedBalancesResult());

  const krakenAccounts = await ensureUserKrakenAccount(userId);
  await syncKrakenAccounts(userId, krakenAccounts);

  return investmentBalancesView(await getCurrentUserKrakenBalances(userId));
}

export type KrakenTransactionsActionResult = {
  transactions: CurrentKrakenTransaction[];
  message: string;
  error: string | null;
  historyStatus: KrakenTransactionHistoryStatus;
};

export async function loadKrakenTransactions(): Promise<KrakenTransactionsActionResult> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      historyStatus: { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false, phase: "up_to_date" },
    };
  }

  try {
    const accounts = await getUserKrakenAccounts(userId);
    if (accounts.length === 0) {
      return {
        transactions: [],
        message: "",
        error: "Add Kraken API credentials before syncing transactions.",
        historyStatus: {
          earliestTransactionAt: null,
          latestTransactionAt: null,
          hasMore: false,
          phase: "up_to_date",
        },
      };
    }

    let queuedAccountCount = 0;
    for (const account of accounts) {
      const leaseToken = randomUUID();
      const claimed = await claimInvestmentTransactionSyncLease({
        userId,
        investmentAccountId: account.id,
        provider: "kraken",
        leaseToken,
      });
      if (!claimed) continue;

      try {
        await start(syncKrakenTransactionHistory, [userId, account.id, leaseToken]);
        queuedAccountCount += 1;
      } catch (error) {
        await releaseInvestmentTransactionSyncLease({
          userId,
          investmentAccountId: account.id,
          provider: "kraken",
          leaseToken,
        });
        throw error;
      }
    }
    revalidatePath("/exchanges");
    const [transactions, historyStatus] = await Promise.all([
      getCurrentKrakenTransactions(userId),
      getKrakenTransactionHistoryStatus(userId),
    ]);
    return {
      transactions,
      message: queuedAccountCount > 0
        ? `Queued transaction history sync for ${queuedAccountCount} Kraken ${queuedAccountCount === 1 ? "account" : "accounts"}.`
        : "Transaction history sync is already running.",
      error: null,
      historyStatus,
    };
  } catch (error) {
    const [transactions, historyStatus] = await Promise.all([
      getCurrentKrakenTransactions(userId),
      getKrakenTransactionHistoryStatus(userId),
    ]);
    return {
      transactions,
      message: "",
      error: error instanceof Error ? error.message : "Failed to refresh Kraken transactions.",
      historyStatus,
    };
  }
}

/** Read-only snapshot of Kraken transactions for polling an in-progress sync. */
export async function pollKrakenTransactions(): Promise<KrakenTransactionsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      historyStatus: { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false, phase: "up_to_date" },
    };
  }

  const [transactions, historyStatus] = await Promise.all([
    getCurrentKrakenTransactions(userId),
    getKrakenTransactionHistoryStatus(userId),
  ]);
  return { transactions, message: "", error: null, historyStatus };
}
