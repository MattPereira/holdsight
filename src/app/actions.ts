"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getCurrentEvmBalances,
  syncEvmWalletBalances,
} from "@/lib/evm/balances";
import { ensureUserHyperCoreAccounts, getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import {
  getCurrentHyperCoreBalances,
  syncHyperCoreAccounts,
} from "@/lib/hyper-core/balances";
import { processHyperCoreTransactionSyncPage } from "@/lib/hyper-core/transactions";
import {
  getCurrentWalletTransactions,
  getWalletTransactionHistoryStatus,
  type WalletTransactionHistoryStatus,
} from "@/lib/wallets/transactions";
import { mergeWalletBalanceResults } from "@/lib/wallets/balances";
import { syncEvmTransactionHistory } from "@/workflows/evm-transaction-sync";
import { syncHyperCoreTransactionHistory } from "@/workflows/hyper-core-transaction-sync";
import {
  connectLighterAccount,
  getUserLighterAccounts,
  removeLighterAccount,
  type SavedLighterAccount,
} from "@/lib/lighter/accounts";
import {
  getCurrentLighterBalances,
  syncLighterAccounts,
} from "@/lib/lighter/balances";
import { syncLighterTransactionHistory } from "@/workflows/lighter-transaction-sync";
import { processLighterTransactionSyncPage } from "@/lib/lighter/transactions";
import {
  ensureUserKrakenAccount,
  getUserKrakenAccounts,
  removeUserKrakenAccount,
  saveUserKrakenCredentials,
  type SavedKrakenAccount,
} from "@/lib/exchange/kraken/accounts";
import {
  getCurrentUserKrakenBalances,
  syncKrakenAccounts,
  syncUserKrakenAccounts,
} from "@/lib/exchange/kraken/balances";
import {
  getCurrentKrakenTransactions,
  getKrakenTransactionHistoryStatus,
  type CurrentKrakenTransaction,
  type KrakenTransactionHistoryStatus,
} from "@/lib/exchange/kraken/transactions";
import { syncKrakenTransactionHistory } from "@/workflows/kraken-transaction-sync";
import {
  claimInvestmentTransactionSyncLease,
  failInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease,
} from "@/lib/investment-transactions/ingestion";
import {
  getUserInvestmentTransactionJournalEntry,
  removeUserInvestmentTransactionJournalEntry,
  saveUserInvestmentTransactionJournalEntry,
  withTransactionJournalSummaries,
  type TradeJournalEntryInput,
  type TradeJournalEntryRow,
} from "@/lib/investment-transactions/journal";
import {
  addUserEvmAccount,
  getUserEvmAccounts,
  removeUserEvmAccount,
  renameUserEvmAccount,
  validateUserEvmAccounts,
  type SavedEvmAccount,
} from "@/lib/evm/accounts";
import {
  createLinkToken,
  exchangePublicToken,
  getDepositoryAccounts,
  getInstitution,
  normalizePlaidAccountFamilies,
  readPlaidError,
  type PlaidAccountFamily,
} from "@/lib/plaid/client";
import {
  getUserPlaidItems,
  getUserBrokeragePlaidItems,
  PlaidRevokeError,
  removeUserPlaidItem,
  upsertPlaidItem,
  type SavedPlaidItem,
} from "@/lib/plaid/items";
import { getPlaidHoldings } from "@/lib/brokerage/providers/plaid/client";
import {
  getUserBrokerageAccounts,
  saveBrokerageAccounts,
} from "@/lib/brokerage/accounts";
import {
  getUserSchwabConnections,
  removeUserSchwabConnection,
  type SavedBrokerageConnection,
} from "@/lib/brokerage/connections";
import {
  applyItemHoldings,
  getCurrentBrokerageBalances,
  syncUserBrokerageBalances,
  type CurrentBrokerageAccount,
} from "@/lib/brokerage/balances";
import {
  getCurrentBrokerageTransactions,
  getBrokerageTransactionImportStatus,
  type CurrentBrokerageTransaction,
} from "@/lib/brokerage/transactions";
import { syncBrokerageTransactionHistory } from "@/workflows/brokerage-transaction-sync";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import {
  mergePortfolioTransactions,
  type PortfolioTransactionsSnapshot,
} from "@/lib/portfolio/transactions";
import {
  getUserDepositoryAccounts,
  saveDepositoryAccounts,
  type DepositoryAccountRow,
} from "@/lib/depository/accounts";
import { syncUserDepositoryBalances } from "@/lib/depository/balances";
import {
  getUserCreditCardAccounts,
  saveCreditCardAccounts,
  type CreditCardAccountRow,
} from "@/lib/credit-card/accounts";
import { getCreditCardAccounts } from "@/lib/credit-card/client";
import { syncUserCreditCardAccounts } from "@/lib/credit-card/balances";
import {
  createManualBalanceItem,
  getUserManualBalanceItems,
  removeUserManualBalanceItem,
  updateUserManualBalanceItem,
  type ManualBalanceItemInput,
  type ManualBalanceItemRow,
} from "@/lib/manual-balance/items";
import {
  emptyPortfolioHomeData,
  getCurrentPortfolioHomeData,
  type PortfolioHomeData,
} from "@/lib/portfolio/page-data";
import type { BalancesResult } from "@/lib/portfolio/types";
import { isSchwabConfigured } from "@/lib/brokerage/providers/schwab/config";

export type WalletActionResult = {
  wallets: SavedEvmAccount[];
  message: string;
  error: string | null;
};

async function unauthorizedWalletResult(): Promise<WalletActionResult> {
  return {
    wallets: [],
    message: "",
    error: "You must be signed in to manage wallets.",
  };
}

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

export async function addWallets(
  address: string,
  label: string,
): Promise<WalletActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedWalletResult();

  const result = await addUserEvmAccount(userId, address, label);
  const wallets = await getUserEvmAccounts(userId);
  if (result.error) {
    return { wallets, message: "", error: result.error };
  }

  revalidatePath("/");
  return {
    wallets,
    message: "Wallet added.",
    error: null,
  };
}

export async function renameWallet(
  address: string,
  label: string,
): Promise<WalletActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedWalletResult();

  const result = await renameUserEvmAccount(userId, address, label);
  const wallets = await getUserEvmAccounts(userId);
  if (result.error) {
    return { wallets, message: "", error: result.error };
  }

  revalidatePath("/");
  return { wallets, message: "Wallet renamed.", error: null };
}

export async function removeWallet(
  address: string,
): Promise<WalletActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedWalletResult();

  await removeUserEvmAccount(userId, address);
  const wallets = await getUserEvmAccounts(userId);

  revalidatePath("/");
  return {
    wallets,
    message: "Wallet removed.",
    error: null,
  };
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
  const userId = await getCurrentUserId();
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
  const userId = await getCurrentUserId();
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

export async function loadWalletBalances(): Promise<BalancesResult[]> {
  const userId = await getCurrentUserId();
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
  const lighterAccounts = await getUserLighterAccounts(userId);
  await syncEvmWalletBalances(wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);
  await syncLighterAccounts(userId, lighterAccounts);

  const [evmResults, hyperCoreResults, lighterResults] = await Promise.all([
    getCurrentEvmBalances(userId),
    getCurrentHyperCoreBalances(hyperCoreAccounts),
    getCurrentLighterBalances(lighterAccounts),
  ]);

  return mergeWalletBalanceResults(evmResults, hyperCoreResults, lighterResults);
}

export type WalletTransactionsActionResult = {
  transactions: Awaited<ReturnType<typeof getCurrentWalletTransactions>> | null;
  message: string;
  error: string | null;
  historyStatus: WalletTransactionHistoryStatus;
};

export async function loadWalletTransactions(): Promise<WalletTransactionsActionResult> {
  const userId = await getCurrentUserId();
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
        const firstPage = await processHyperCoreTransactionSyncPage({
          userId,
          account,
        });
        if (firstPage.shouldContinue) {
          await start(syncHyperCoreTransactionHistory, [userId, account.id, leaseToken]);
        } else {
          await releaseInvestmentTransactionSyncLease({
            userId,
            investmentAccountId: account.id,
            provider: "hyperliquid",
            leaseToken,
          });
        }
        queuedHyperCoreAccountCount += 1;
      } catch (error) {
        await failInvestmentTransactionSyncLease({
          userId,
          investmentAccountId: account.id,
          provider: "hyperliquid",
          leaseToken,
          message: error instanceof Error
            ? error.message
            : "HyperCore transaction sync failed.",
          httpStatus: error instanceof Error && "httpStatus" in error
            ? Number(error.httpStatus) || null
            : null,
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
        const firstPage = await processLighterTransactionSyncPage({ userId, account });
        if (firstPage.shouldContinue) {
          await start(syncLighterTransactionHistory, [userId, account.id, leaseToken]);
        } else {
          await releaseInvestmentTransactionSyncLease({
            userId, investmentAccountId: account.id, provider: "lighter", leaseToken,
          });
        }
        queuedLighterAccountCount += 1;
      } catch (error) {
        await failInvestmentTransactionSyncLease({
          userId, investmentAccountId: account.id, provider: "lighter", leaseToken,
          message: error instanceof Error
            ? error.message
            : "Lighter transaction sync failed.",
          httpStatus: error instanceof Error && "httpStatus" in error
            ? Number(error.httpStatus) || null
            : null,
        });
        throw error;
      }
    }

    const evmWorkflowAccounts: Array<{ id: string; leaseToken: string }> = [];
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

export async function loadKrakenBalances(): Promise<BalancesResult[]> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedBalancesResult();

  const krakenAccounts = await ensureUserKrakenAccount(userId);
  await syncKrakenAccounts(userId, krakenAccounts);

  return getCurrentUserKrakenBalances(userId);
}

export type KrakenTransactionsActionResult = {
  transactions: CurrentKrakenTransaction[];
  message: string;
  error: string | null;
  historyStatus: KrakenTransactionHistoryStatus;
};

export async function loadKrakenTransactions(): Promise<KrakenTransactionsActionResult> {
  const userId = await getCurrentUserId();
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

export type KrakenCredentialsActionResult = {
  message: string;
  error: string | null;
};

export async function saveKrakenCredentials(input: {
  apiKey: string;
  apiSecret: string;
}): Promise<KrakenCredentialsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { message: "", error: "You must be signed in to add credentials." };
  }

  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  if (!apiKey || !apiSecret) {
    return { message: "", error: "Enter both Kraken API key and secret." };
  }

  try {
    const account = await saveUserKrakenCredentials(userId, {
      apiKey,
      apiSecret,
    });
    await syncKrakenAccounts(userId, [account]);
    revalidatePath("/");
    revalidatePath("/exchange");
    return { message: "Kraken credentials saved.", error: null };
  } catch (error) {
    return {
      message: "",
      error:
        error instanceof Error
          ? error.message
          : "Failed to save Kraken credentials.",
    };
  }
}

export async function removeKrakenAccount(
  investmentAccountId: string,
): Promise<{ error: string | null }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { error: "You must be signed in to remove an account." };
  }

  await removeUserKrakenAccount(userId, investmentAccountId);
  revalidatePath("/");
  revalidatePath("/exchange");
  return { error: null };
}

export async function saveLighterConnection(input: {
  evmInvestmentAccountId: string;
  readOnlyToken: string;
}): Promise<{ message: string; error: string | null }> {
  const userId = await getCurrentUserId();
  if (!userId) return { message: "", error: "You must be signed in to add credentials." };
  if (!input.evmInvestmentAccountId || !input.readOnlyToken.trim()) {
    return { message: "", error: "Select a wallet and enter a Lighter read-only token." };
  }
  try {
    const account = await connectLighterAccount({
      userId,
      evmInvestmentAccountId: input.evmInvestmentAccountId,
      token: input.readOnlyToken,
    });
    await syncLighterAccounts(userId, [account]);
    const leaseToken = randomUUID();
    const claimed = await claimInvestmentTransactionSyncLease({
      userId,
      investmentAccountId: account.id,
      provider: "lighter",
      leaseToken,
    });
    if (claimed) {
      try {
        const firstPage = await processLighterTransactionSyncPage({ userId, account });
        if (firstPage.shouldContinue) {
          await start(syncLighterTransactionHistory, [userId, account.id, leaseToken]);
        } else {
          await releaseInvestmentTransactionSyncLease({
            userId,
            investmentAccountId: account.id,
            provider: "lighter",
            leaseToken,
          });
        }
      } catch (error) {
        await failInvestmentTransactionSyncLease({
          userId,
          investmentAccountId: account.id,
          provider: "lighter",
          leaseToken,
          message: error instanceof Error
            ? error.message
            : "Lighter transaction sync failed.",
          httpStatus: error instanceof Error && "httpStatus" in error
            ? Number(error.httpStatus) || null
            : null,
        });
        throw error;
      }
    }
    revalidatePath("/");
    revalidatePath("/wallets");
    revalidatePath("/connections");
    return { message: "Lighter account connected.", error: null };
  } catch (error) {
    return { message: "", error: error instanceof Error ? error.message : "Failed to connect Lighter." };
  }
}

export async function removeLighterConnection(
  investmentAccountId: string,
): Promise<{ error: string | null }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "You must be signed in to remove an account." };
  await removeLighterAccount(userId, investmentAccountId);
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/connections");
  return { error: null };
}

/* -------------------------------- plaid -------------------------------- */

export type BrokerageActionResult = {
  accounts: CurrentBrokerageAccount[];
  error: string | null;
};

export type BrokerageTransactionsActionResult = {
  transactions: CurrentBrokerageTransaction[];
  message: string;
  error: string | null;
  isSyncing: boolean;
};

export type DepositoryActionResult = {
  accounts: DepositoryAccountRow[];
  error: string | null;
};

export type CreditCardActionResult = {
  accounts: CreditCardAccountRow[];
  error: string | null;
};

export type PlaidAccountsActionResult = {
  brokerageAccounts: CurrentBrokerageAccount[];
  depositoryAccounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  error: string | null;
};

export type PlaidLinkTokenActionResult = {
  linkToken: string | null;
  error: string | null;
};

function plaidActionErrorMessage(error: unknown, fallback: string): string {
  const { code, message } = readPlaidError(error);
  return code ? `${code}: ${message}` : (message ?? fallback);
}

function accountFamilyError(families: PlaidAccountFamily[]): string | null {
  return families.length > 0
    ? null
    : "Select at least one supported account type.";
}

async function currentPlaidAccounts(
  userId: string,
  error: string | null,
): Promise<PlaidAccountsActionResult> {
  const [brokerageAccounts, depositoryAccounts, creditCardAccounts] =
    await Promise.all([
      getCurrentBrokerageBalances(userId),
      getUserDepositoryAccounts(userId),
      getUserCreditCardAccounts(userId),
    ]);

  return {
    brokerageAccounts,
    depositoryAccounts,
    creditCardAccounts,
    error,
  };
}

function plaidResultError(
  result:
    | Awaited<ReturnType<typeof getPlaidHoldings>>
    | Awaited<ReturnType<typeof getDepositoryAccounts>>
    | Awaited<ReturnType<typeof getCreditCardAccounts>>,
): string | null {
  if (result.status === "error") return result.message;
  if (result.status === "login_required") {
    return "Plaid needs you to finish signing in. Please try linking again.";
  }
  return null;
}

function brokerageSyncError(accounts: CurrentBrokerageAccount[]): string | null {
  const messages = accounts
    .filter((account) => account.syncStatus === "error")
    .map((account) => account.syncErrorMessage?.trim())
    .filter((message): message is string => Boolean(message));

  return messages[0] ?? null;
}

async function createPlaidLinkTokenForFamilies(
  familiesInput: readonly string[],
): Promise<PlaidLinkTokenActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      linkToken: null,
      error: "You must be signed in to link an account.",
    };
  }

  const families = normalizePlaidAccountFamilies(familiesInput);
  const inputError = accountFamilyError(families);
  if (inputError) return { linkToken: null, error: inputError };

  try {
    const linkToken = await createLinkToken(userId, families);
    return { linkToken, error: null };
  } catch (error) {
    return {
      linkToken: null,
      error: plaidActionErrorMessage(error, "Failed to start Plaid Link."),
    };
  }
}

/**
 * Create a Plaid link_token for the selected account families.
 */
export async function createPlaidAccountsLinkToken(
  families: readonly string[],
): Promise<PlaidLinkTokenActionResult> {
  return createPlaidLinkTokenForFamilies(families);
}

async function linkPlaidAccountsForFamilies({
  publicToken,
  familiesInput,
  errorFamiliesInput,
}: {
  publicToken: string;
  familiesInput: readonly string[];
  errorFamiliesInput?: readonly string[];
}): Promise<PlaidAccountsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      brokerageAccounts: [],
      depositoryAccounts: [],
      creditCardAccounts: [],
      error: "You must be signed in to link an account.",
    };
  }

  const families = normalizePlaidAccountFamilies(familiesInput);
  const errorFamilies = normalizePlaidAccountFamilies(
    errorFamiliesInput ?? familiesInput,
  );
  const inputError = accountFamilyError(families);
  if (inputError) return currentPlaidAccounts(userId, inputError);

  try {
    const exchange = await exchangePublicToken(publicToken);
    const institution = await getInstitution(exchange.accessToken);
    const plaidItemId = await upsertPlaidItem(userId, exchange, institution);
    const errors: string[] = [];

    if (families.includes("checking") || families.includes("savings")) {
      const depository = await getDepositoryAccounts(exchange.accessToken);
      if (depository.status === "ready") {
        const accounts = depository.accounts.filter((account) =>
          families.includes(account.kind),
        );
        await saveDepositoryAccounts(
          userId,
          plaidItemId,
          institution.institutionName,
          accounts,
        );
      } else if (
        errorFamilies.includes("checking") ||
        errorFamilies.includes("savings")
      ) {
        const message = plaidResultError(depository);
        if (message) errors.push(message);
      }
    }

    if (families.includes("brokerage")) {
      const holdings = await getPlaidHoldings(exchange.accessToken);
      if (holdings.status === "ready") {
        await saveBrokerageAccounts(
          userId,
          plaidItemId,
          institution.institutionName ?? "Brokerage",
          holdings.accounts,
        );
        await applyItemHoldings(plaidItemId, holdings);
      } else if (errorFamilies.includes("brokerage")) {
        const message = plaidResultError(holdings);
        if (message) errors.push(message);
      }
    }

    if (families.includes("credit_card")) {
      const creditCards = await getCreditCardAccounts(exchange.accessToken);
      if (creditCards.status === "ready") {
        await saveCreditCardAccounts(
          userId,
          plaidItemId,
          institution.institutionName,
          creditCards.accounts,
        );
      } else if (errorFamilies.includes("credit_card")) {
        const message = plaidResultError(creditCards);
        if (message) errors.push(message);
      }
    }

    revalidatePath("/");
    revalidatePath("/brokerages");
    return currentPlaidAccounts(userId, errors[0] ?? null);
  } catch (error) {
    return currentPlaidAccounts(
      userId,
      plaidActionErrorMessage(error, "Failed to link account."),
    );
  }
}

/**
 * Exchange the public_token and save selected supported account families.
 */
export async function linkPlaidAccounts(
  publicToken: string,
  families: readonly string[],
): Promise<PlaidAccountsActionResult> {
  return linkPlaidAccountsForFamilies({
    publicToken,
    familiesInput: families,
  });
}

/**
 * Refresh brokerage holdings for every linked Plaid Item.
 */
export async function loadBrokerageBalances(): Promise<BrokerageActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to view balances." };
  }

  try {
    await syncUserBrokerageBalances(userId);
  } catch (error) {
    const accounts = await getCurrentBrokerageBalances(userId);
    return {
      accounts,
      error: plaidActionErrorMessage(error, "Failed to refresh brokerage."),
    };
  }

  const accounts = await getCurrentBrokerageBalances(userId);
  revalidatePath("/");
  revalidatePath("/brokerages");
  return { accounts, error: brokerageSyncError(accounts) };
}

/**
 * Refresh brokerage investment transactions separately from brokerage balances.
 */
export async function loadBrokerageTransactions(): Promise<BrokerageTransactionsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      isSyncing: false,
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

      const claimedAccounts: Array<{ id: string; leaseToken: string }> = [];
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
      isSyncing: status.isSyncing,
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
      isSyncing: status.isSyncing,
    };
  }
}

/** Read-only snapshot of brokerage transactions for polling an in-progress sync. */
export async function pollBrokerageTransactions(): Promise<BrokerageTransactionsActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      transactions: [],
      message: "",
      error: "You must be signed in to refresh transactions.",
      isSyncing: false,
    };
  }

  const [transactions, status] = await Promise.all([
    getCurrentBrokerageTransactions(userId),
    getBrokerageTransactionImportStatus(userId),
  ]);
  return { transactions, message: "", error: null, isSyncing: status.isSyncing };
}

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
  brokerage: BrokerageTransactionsActionResult,
): PortfolioTransactionsActionResult {
  const snapshot = mergePortfolioTransactions(
    [
      wallet.transactions ?? [],
      kraken.transactions,
      brokerage.transactions,
    ],
    {
      walletPhase: wallet.historyStatus.phase,
      walletHasMore: wallet.historyStatus.hasMore,
      walletLatestTransactionUpdatedAt:
        wallet.historyStatus.latestTransactionUpdatedAt,
      krakenPhase: kraken.historyStatus.phase,
      krakenHasMore: kraken.historyStatus.hasMore,
      brokerageIsSyncing: brokerage.isSyncing,
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
    activePortfolioTransactionMessage(brokerage.message, brokerage.isSyncing),
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
 * return the merged feed for the home page's Transactions tab. Fans out to the
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

/* ------------------------ transaction journal ------------------------ */

export type TransactionJournalActionResult = {
  entry: TradeJournalEntryRow | null;
  error: string | null;
};

function revalidateTransactionJournalPaths(): void {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchange");
  revalidatePath("/brokerages");
}

export async function getTransactionJournalEntry(
  transactionId: string,
): Promise<TransactionJournalActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      entry: null,
      error: "You must be signed in to view journal entries.",
    };
  }

  return {
    entry: await getUserInvestmentTransactionJournalEntry(
      userId,
      transactionId,
    ),
    error: null,
  };
}

export async function saveTransactionJournalEntry(
  transactionId: string,
  input: TradeJournalEntryInput,
): Promise<TransactionJournalActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      entry: null,
      error: "You must be signed in to manage journal entries.",
    };
  }

  const result = await saveUserInvestmentTransactionJournalEntry(
    userId,
    transactionId,
    input,
  );
  if (!result.error) revalidateTransactionJournalPaths();

  return result;
}

export async function removeTransactionJournalEntry(
  transactionId: string,
): Promise<TransactionJournalActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      entry: null,
      error: "You must be signed in to manage journal entries.",
    };
  }

  await removeUserInvestmentTransactionJournalEntry(userId, transactionId);
  revalidateTransactionJournalPaths();

  return { entry: null, error: null };
}

/**
 * Refresh depository (checking/savings) balances for every linked Plaid Item.
 */
export async function loadDepositoryBalances(): Promise<DepositoryActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to view balances." };
  }

  await syncUserDepositoryBalances(userId);
  revalidatePath("/");
  return { accounts: await getUserDepositoryAccounts(userId), error: null };
}

/**
 * Refresh credit-card balances and liability details for every linked Plaid Item.
 */
export async function loadCreditCardAccounts(): Promise<CreditCardActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to view balances." };
  }

  await syncUserCreditCardAccounts(userId);
  revalidatePath("/");
  return { accounts: await getUserCreditCardAccounts(userId), error: null };
}

// Shown when revoking the Item at Plaid fails transiently and we deliberately
// leave the local rows intact so the user can retry rather than orphaning a
// still-live authorization.
const PLAID_REVOKE_RETRY_MESSAGE =
  "Couldn't reach the institution to disconnect. Please try again.";

/**
 * Unlink a Plaid Item and delete all of its accounts.
 * Returns the user's remaining brokerage accounts (called from that page).
 */
export async function removeBrokerage(
  plaidItemId: string,
): Promise<BrokerageActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      accounts: [],
      error: "You must be signed in to remove an account.",
    };
  }

  try {
    await removeUserPlaidItem(userId, plaidItemId);
  } catch (error) {
    if (error instanceof PlaidRevokeError) {
      return {
        accounts: await getCurrentBrokerageBalances(userId),
        error: PLAID_REVOKE_RETRY_MESSAGE,
      };
    }
    throw error;
  }
  revalidatePath("/");
  return { accounts: await getCurrentBrokerageBalances(userId), error: null };
}

/**
 * Unlink a Plaid Item and delete all of its accounts.
 * Returns the user's remaining depository accounts (called from that page).
 */
export async function removeDepository(
  plaidItemId: string,
): Promise<DepositoryActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      accounts: [],
      error: "You must be signed in to remove an account.",
    };
  }

  try {
    await removeUserPlaidItem(userId, plaidItemId);
  } catch (error) {
    if (error instanceof PlaidRevokeError) {
      return {
        accounts: await getUserDepositoryAccounts(userId),
        error: PLAID_REVOKE_RETRY_MESSAGE,
      };
    }
    throw error;
  }
  revalidatePath("/");
  return { accounts: await getUserDepositoryAccounts(userId), error: null };
}

/**
 * Unlink a Plaid Item and delete all of its accounts.
 * Returns the user's remaining credit-card accounts.
 */
export async function removeCreditCard(
  plaidItemId: string,
): Promise<CreditCardActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      accounts: [],
      error: "You must be signed in to remove an account.",
    };
  }

  try {
    await removeUserPlaidItem(userId, plaidItemId);
  } catch (error) {
    if (error instanceof PlaidRevokeError) {
      return {
        accounts: await getUserCreditCardAccounts(userId),
        error: PLAID_REVOKE_RETRY_MESSAGE,
      };
    }
    throw error;
  }
  revalidatePath("/");
  return { accounts: await getUserCreditCardAccounts(userId), error: null };
}

/* ----------------------- account connections hub ----------------------- */

export type AccountConnectionsResult = {
  wallets: SavedEvmAccount[];
  lighterAccounts: SavedLighterAccount[];
  krakenAccounts: SavedKrakenAccount[];
  plaidItems: SavedPlaidItem[];
  schwabConnections: SavedBrokerageConnection[];
  schwabConfigured: boolean;
  manualItems: ManualBalanceItemRow[];
  error: string | null;
};

/**
 * Load every connection the user manages, for the centralized connect sheet.
 * Fetched lazily when the sheet opens rather than on every page render.
 */
export async function getAccountConnections(): Promise<AccountConnectionsResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      wallets: [],
      lighterAccounts: [],
      krakenAccounts: [],
      plaidItems: [],
      schwabConnections: [],
      schwabConfigured: isSchwabConfigured(),
      manualItems: [],
      error: "You must be signed in to manage connections.",
    };
  }

  const [
    wallets,
    lighterAccounts,
    krakenAccounts,
    plaidItems,
    schwabConnections,
    manualItems,
  ] = await Promise.all([
    getUserEvmAccounts(userId),
    getUserLighterAccounts(userId),
    getUserKrakenAccounts(userId),
    getUserPlaidItems(userId),
    getUserSchwabConnections(userId),
    getUserManualBalanceItems(userId),
  ]);

  return {
    wallets,
    lighterAccounts,
    krakenAccounts,
    plaidItems,
    schwabConnections,
    schwabConfigured: isSchwabConfigured(),
    manualItems,
    error: null,
  };
}

/**
 * Unlink a Plaid Item (institution) and delete all of its accounts across
 * brokerage, depository, and credit. Institution-level removal for the
 * centralized connect sheet; returns the remaining items.
 */
export async function removePlaidItem(
  plaidItemId: string,
): Promise<{ plaidItems: SavedPlaidItem[]; error: string | null }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      plaidItems: [],
      error: "You must be signed in to remove a connection.",
    };
  }

  try {
    await removeUserPlaidItem(userId, plaidItemId);
  } catch (error) {
    if (error instanceof PlaidRevokeError) {
      return {
        plaidItems: await getUserPlaidItems(userId),
        error: PLAID_REVOKE_RETRY_MESSAGE,
      };
    }
    throw error;
  }
  revalidatePath("/");
  return { plaidItems: await getUserPlaidItems(userId), error: null };
}

export async function removeSchwabConnection(
  connectionId: string,
): Promise<{
  schwabConnections: SavedBrokerageConnection[];
  error: string | null;
}> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      schwabConnections: [],
      error: "You must be signed in to remove a connection.",
    };
  }

  await removeUserSchwabConnection(userId, connectionId);
  revalidatePath("/");
  revalidatePath("/connections");
  return {
    schwabConnections: await getUserSchwabConnections(userId),
    error: null,
  };
}

/* --------------------------- manual balances --------------------------- */

export type ManualBalanceActionResult = {
  items: ManualBalanceItemRow[];
  error: string | null;
};

async function unauthorizedManualBalanceResult(): Promise<ManualBalanceActionResult> {
  return {
    items: [],
    error: "You must be signed in to manage custom items.",
  };
}

export async function addManualBalanceItem(
  input: ManualBalanceItemInput,
): Promise<ManualBalanceActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedManualBalanceResult();

  const result = await createManualBalanceItem(userId, input);
  const items = await getUserManualBalanceItems(userId);
  if (result.error) return { items, error: result.error };

  revalidatePath("/");
  return { items, error: null };
}

export async function updateManualBalanceItem(
  itemId: string,
  input: ManualBalanceItemInput,
): Promise<ManualBalanceActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedManualBalanceResult();

  const result = await updateUserManualBalanceItem(userId, itemId, input);
  const items = await getUserManualBalanceItems(userId);
  if (result.error) return { items, error: result.error };

  revalidatePath("/");
  return { items, error: null };
}

export async function removeManualBalanceItem(
  itemId: string,
): Promise<ManualBalanceActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedManualBalanceResult();

  await removeUserManualBalanceItem(userId, itemId);
  const items = await getUserManualBalanceItems(userId);

  revalidatePath("/");
  return { items, error: null };
}

export async function loadPortfolioPageData(): Promise<PortfolioHomeData> {
  const userId = await getCurrentUserId();
  if (!userId) return emptyPortfolioHomeData();

  const syncWallets = async () => {
    const wallets = await getUserEvmAccounts(userId);
    if (wallets.length === 0) return;

    await syncEvmWalletBalances(wallets);

    const hyperCoreAccounts = await ensureUserHyperCoreAccounts(
      userId,
      wallets,
    );
    await syncHyperCoreAccounts(hyperCoreAccounts);
    const lighterAccounts = await getUserLighterAccounts(userId);
    await syncLighterAccounts(userId, lighterAccounts);
  };

  await Promise.all([
    syncWallets(),
    syncUserKrakenAccounts(userId),
    syncUserBrokerageBalances(userId),
    syncUserDepositoryBalances(userId),
    syncUserCreditCardAccounts(userId),
  ]);

  return getCurrentPortfolioHomeData(userId);
}
