"use server";


import type {
  TransactionsView
} from "@/components/accounts/transactions/types";
import { getCurrentUserId } from "@/lib/auth/session";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import { withTransactionJournalSummaries } from "@/lib/journal/transaction-entry";
import {
  mergePortfolioTransactions,
  type PortfolioTransactionsSnapshot,
} from "@/lib/portfolio/transactions";


import { loadBrokerageTransactions, pollBrokerageTransactions } from "@/app/(app)/brokerages/actions";
import {
  loadKrakenTransactions,
  pollKrakenTransactions,
  type KrakenTransactionsActionResult,
} from "@/app/(app)/exchanges/actions";
import {
  loadWalletTransactions,
  pollWalletTransactions,
  type WalletTransactionsActionResult,
} from "@/app/(app)/wallets/actions";

export type PortfolioTransactionsActionResult = {
  transactions: InvestmentTransactionListItem[];
  message: string;
  error: string | null;
  historyStatus: PortfolioTransactionsSnapshot["historyStatus"];
  isSyncing: boolean;
};

const WALLET_SOURCE_NOT_CONFIGURED_ERROR =
  "Add at least one wallet before syncing transactions.";
const KRAKEN_SOURCE_NOT_CONFIGURED_ERROR =
  "Add Kraken API credentials before syncing transactions.";

function portfolioTransactionError(error: string | null): string | null {
  if (
    error === WALLET_SOURCE_NOT_CONFIGURED_ERROR ||
    error === KRAKEN_SOURCE_NOT_CONFIGURED_ERROR
  ) {
    return null;
  }

  return error;
}

function activePortfolioTransactionMessage(
  message: string,
  isActive: boolean,
): string | null {
  return isActive && message ? message : null;
}

function combinePortfolioTransactionResults(
  wallet: WalletTransactionsActionResult,
  kraken: KrakenTransactionsActionResult,
  brokerage: TransactionsView,
): PortfolioTransactionsActionResult {
  const snapshot = mergePortfolioTransactions(
    [
      wallet.transactions ?? [],
      kraken.transactions,
      brokerage.transactions ?? [],
    ],
    {
      walletPhase: wallet.historyStatus.phase,
      walletHasMore: wallet.historyStatus.hasMore,
      walletLatestTransactionUpdatedAt:
        wallet.historyStatus.latestTransactionUpdatedAt,
      krakenPhase: kraken.historyStatus.phase,
      krakenHasMore: kraken.historyStatus.hasMore,
      brokerageIsSyncing: brokerage.historyStatus.hasMore,
    },
  );

  const messages = [
    activePortfolioTransactionMessage(
      wallet.message,
      wallet.historyStatus.hasMore,
    ),
    activePortfolioTransactionMessage(
      kraken.message,
      kraken.historyStatus.hasMore,
    ),
    activePortfolioTransactionMessage(
      brokerage.message,
      brokerage.historyStatus.hasMore,
    ),
  ].filter((message): message is string => Boolean(message));
  const errors = [
    portfolioTransactionError(wallet.error),
    portfolioTransactionError(kraken.error),
    brokerage.error,
  ].filter((error): error is string => Boolean(error));

  return {
    transactions: snapshot.transactions,
    message: [...new Set(messages)].join(" "),
    error: errors.length > 0 ? errors.join(" ") : null,
    historyStatus: snapshot.historyStatus,
    isSyncing: snapshot.isSyncing,
  };
}

/**
 * Sync every investment transaction source (wallets, exchanges, brokerages) and
 * return the merged feed for the Trades page. Fans out to the
 * per-source loaders so each still claims its own leases and starts its own
 * workflows.
 */
async function attachJournalSummaries(
  result: PortfolioTransactionsActionResult,
): Promise<PortfolioTransactionsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return result;
  return {
    ...result,
    transactions: await withTransactionJournalSummaries(
      userId,
      result.transactions,
    ),
  };
}

export async function loadPortfolioTransactions(): Promise<PortfolioTransactionsActionResult> {
  const [wallet, kraken, brokerage] = await Promise.all([
    loadWalletTransactions(),
    loadKrakenTransactions(),
    loadBrokerageTransactions(),
  ]);
  return attachJournalSummaries(
    combinePortfolioTransactionResults(wallet, kraken, brokerage),
  );
}

/** Read-only snapshot of the merged transaction feed for polling a sync. */
export async function pollPortfolioTransactions(): Promise<PortfolioTransactionsActionResult> {
  const [wallet, kraken, brokerage] = await Promise.all([
    pollWalletTransactions(),
    pollKrakenTransactions(),
    pollBrokerageTransactions(),
  ]);
  return attachJournalSummaries(
    combinePortfolioTransactionResults(wallet, kraken, brokerage),
  );
}
