"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";

import type {
  TransactionHistoryStatus,
  TransactionsView,
} from "@/components/accounts/transactions/types";
import {
  brokerageBalancesView,
  type BalancesView
} from "@/lib/accounts/balances-view";
import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  getUserBrokerageAccounts
} from "@/lib/brokerage/accounts";
import {
  getCurrentBrokerageBalances,
  syncUserBrokerageBalances,
  type CurrentBrokerageAccount
} from "@/lib/brokerage/balances";
import {
  getBrokerageTransactionImportStatus,
  getCurrentBrokerageTransactions,
} from "@/lib/brokerage/transactions";
import {
  claimInvestmentTransactionSyncLease,
  failInvestmentTransactionSyncLease
} from "@/lib/investment-transactions/ingestion";
import {
  isPlaidEnabled,
  readPlaidError
} from "@/lib/plaid/client";
import {
  getUserBrokeragePlaidItems
} from "@/lib/plaid/items";
import { syncBrokerageTransactionHistory } from "@/workflows/brokerage-transaction-sync";


export type BrokerageActionResult = {
  accounts: CurrentBrokerageAccount[];
  error: string | null;
};

// Brokerage reports sync progress as a single boolean, unlike the wallet/Kraken
// checkpoints. Fold it into a history status so every source speaks the one
// TransactionsView shape the account details view consumes.
function brokerageHistoryStatus(isSyncing: boolean): TransactionHistoryStatus {
  return {
    earliestTransactionAt: null,
    latestTransactionAt: null,
    latestTransactionUpdatedAt: null,
    hasMore: isSyncing,
  };
}

function plaidActionErrorMessage(error: unknown, fallback: string): string {
  const { code, message } = readPlaidError(error);
  return code ? `${code}: ${message}` : (message ?? fallback);
}


/**
 * Refresh brokerage holdings for every linked Plaid Item.
 */
export async function loadBrokerageBalances(): Promise<BalancesView> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) {
    return {
      ...brokerageBalancesView([]),
      error: "You must be signed in to view balances.",
    };
  }

  try {
    await syncUserBrokerageBalances(userId);
  } catch (error) {
    const accounts = await getCurrentBrokerageBalances(userId);
    return {
      ...brokerageBalancesView(accounts),
      error: plaidActionErrorMessage(error, "Failed to refresh brokerage."),
    };
  }

  const accounts = await getCurrentBrokerageBalances(userId);
  revalidatePath("/");
  revalidatePath("/brokerages");
  return brokerageBalancesView(accounts);
}

/**
 * Refresh brokerage investment transactions separately from brokerage balances.
 */
export async function loadBrokerageTransactions(): Promise<TransactionsView> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      historyStatus: brokerageHistoryStatus(false),
    };
  }

  if (!isPlaidEnabled()) {
    const [transactions, status] = await Promise.all([
      getCurrentBrokerageTransactions(userId),
      getBrokerageTransactionImportStatus(userId),
    ]);
    return {
      transactions,
      message: "",
      error: null,
      historyStatus: brokerageHistoryStatus(status.isSyncing),
    };
  }

  try {
    const [items, accounts] = await Promise.all([
      getUserBrokeragePlaidItems(userId),
      getUserBrokerageAccounts(userId),
    ]);
    let queuedItemCount = 0;

    for (const item of items) {
      const itemAccounts = accounts.filter(
        (account) => account.plaidItemId === item.id,
      );
      if (itemAccounts.length === 0) {
        continue;
      }

      const claimedAccounts: Array<{ id: string; leaseToken: string; }> = [];
      for (const account of itemAccounts) {
        const leaseToken = randomUUID();
        const claimed = await claimInvestmentTransactionSyncLease({
          userId,
          investmentAccountId: account.id,
          provider: "plaid",
          leaseToken,
        });
        if (claimed) claimedAccounts.push({ id: account.id, leaseToken });
      }
      if (claimedAccounts.length === 0) continue;

      try {
        await start(syncBrokerageTransactionHistory, [
          userId,
          item.id,
          claimedAccounts,
        ]);
        queuedItemCount += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to queue brokerage transaction sync.";
        await Promise.all(
          claimedAccounts.map(({ id, leaseToken }) =>
            failInvestmentTransactionSyncLease({
              userId,
              investmentAccountId: id,
              provider: "plaid",
              leaseToken,
              message,
            }),
          ),
        );
        throw error;
      }
    }

    revalidatePath("/brokerages");
    const status = await getBrokerageTransactionImportStatus(userId);
    return {
      transactions: await getCurrentBrokerageTransactions(userId),
      message: queuedItemCount > 0
        ? `Queued transaction history sync for ${queuedItemCount} Plaid ${queuedItemCount === 1 ? "connection" : "connections"}.`
        : "Transaction history sync is already running.",
      error: null,
      historyStatus: brokerageHistoryStatus(status.isSyncing),
    };
  } catch (error) {
    const [transactions, status] = await Promise.all([
      getCurrentBrokerageTransactions(userId),
      getBrokerageTransactionImportStatus(userId),
    ]);
    return {
      transactions,
      message: "",
      error: plaidActionErrorMessage(
        error,
        "Failed to refresh brokerage transactions.",
      ),
      historyStatus: brokerageHistoryStatus(status.isSyncing),
    };
  }
}

/** Read-only snapshot of brokerage transactions for polling an in-progress sync. */
export async function pollBrokerageTransactions(): Promise<TransactionsView> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      historyStatus: brokerageHistoryStatus(false),
    };
  }

  const [transactions, status] = await Promise.all([
    getCurrentBrokerageTransactions(userId),
    getBrokerageTransactionImportStatus(userId),
  ]);
  return {
    transactions,
    message: "",
    error: null,
    historyStatus: brokerageHistoryStatus(status.isSyncing),
  };
}
