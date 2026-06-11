"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getCurrentEvmBalances,
  syncEvmWalletBalances,
} from "@/lib/evm/balances";
import { getCurrentPortfolioBalances } from "@/lib/portfolio/balances";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import {
  getCurrentHyperCoreBalances,
  syncHyperCoreAccounts,
} from "@/lib/hyper-core/balances";
import { mergeOnChainBalanceResults } from "@/lib/on-chain/balances";
import {
  ensureUserKrakenAccount,
  removeUserKrakenAccount,
  saveUserKrakenCredentials,
} from "@/lib/exchange/kraken/accounts";
import {
  getCurrentUserKrakenBalances,
  syncKrakenAccounts,
  syncUserKrakenAccounts,
} from "@/lib/exchange/kraken/balances";
import {
  addUserEvmAccounts,
  getUserEvmAccounts,
  removeUserEvmAccount,
  validateUserEvmAccounts,
  type SavedEvmAccount,
} from "@/lib/evm/accounts";
import {
  createLinkToken,
  exchangePublicToken,
  getDepositoryAccounts,
  getInstitution,
  readPlaidError,
} from "@/lib/plaid/client";
import {
  removeUserPlaidItem,
  upsertPlaidItem,
} from "@/lib/plaid/items";
import { getHoldings } from "@/lib/brokerage/client";
import { saveBrokerageAccounts } from "@/lib/brokerage/accounts";
import {
  applyItemHoldings,
  getCurrentBrokerageBalances,
  syncUserBrokerageBalances,
  type CurrentBrokerageAccount,
} from "@/lib/brokerage/balances";
import {
  getUserDepositoryAccounts,
  saveDepositoryAccounts,
  type DepositoryAccountRow,
} from "@/lib/depository/accounts";
import { syncUserDepositoryBalances } from "@/lib/depository/balances";
import {
  portfolioAssetSummary,
  type AssetGroup,
  type PortfolioAssetSummary,
} from "@/lib/portfolio/asset-totals";
import {
  createAssetGroup,
  getUserAssetGroups,
  removeAssetGroup,
  updateAssetGroup,
} from "@/lib/portfolio/groups";
import type { BalancesResult } from "@/lib/portfolio/types";

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

function emptyPortfolioSummary(): PortfolioAssetSummary {
  return { grandTotalValue: 0, totals: [] };
}

export async function addWallets(input: string): Promise<WalletActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedWalletResult();

  const result = await addUserEvmAccounts(userId, input);
  const wallets = await getUserEvmAccounts(userId);
  if (result.error) {
    return { wallets, message: "", error: result.error };
  }

  revalidatePath("/");
  return {
    wallets,
    message:
      result.added === 0
        ? "No new wallets added."
        : `Added ${result.added} wallet${result.added === 1 ? "" : "s"}.`,
    error: null,
  };
}

export async function removeWallet(address: string): Promise<WalletActionResult> {
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

export async function loadOnChainBalances(): Promise<BalancesResult[]> {
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
  await syncEvmWalletBalances(wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);

  const [evmResults, hyperCoreResults] = await Promise.all([
    getCurrentEvmBalances(userId),
    getCurrentHyperCoreBalances(hyperCoreAccounts),
  ]);

  return mergeOnChainBalanceResults(evmResults, hyperCoreResults);
}

export async function loadKrakenBalances(): Promise<BalancesResult[]> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedBalancesResult();

  const krakenAccounts = await ensureUserKrakenAccount(userId);
  await syncKrakenAccounts(userId, krakenAccounts);

  return getCurrentUserKrakenBalances(userId);
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

/* -------------------------------- plaid -------------------------------- */

export type BrokerageActionResult = {
  accounts: CurrentBrokerageAccount[];
  error: string | null;
};

export type DepositoryActionResult = {
  accounts: DepositoryAccountRow[];
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

/**
 * Create a brokerage Plaid link_token so the client can open Plaid Link.
 */
export async function createBrokerageLinkToken(): Promise<PlaidLinkTokenActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { linkToken: null, error: "You must be signed in to link an account." };
  }

  try {
    const linkToken = await createLinkToken(userId, "brokerage");
    return { linkToken, error: null };
  } catch (error) {
    return {
      linkToken: null,
      error: plaidActionErrorMessage(error, "Failed to start Plaid Link."),
    };
  }
}

/**
 * Create a depository Plaid link_token so the client can open Plaid Link.
 */
export async function createDepositoryLinkToken(): Promise<PlaidLinkTokenActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { linkToken: null, error: "You must be signed in to link an account." };
  }

  try {
    const linkToken = await createLinkToken(userId, "depository");
    return { linkToken, error: null };
  } catch (error) {
    return {
      linkToken: null,
      error: plaidActionErrorMessage(error, "Failed to start Plaid Link."),
    };
  }
}

/**
 * Exchange the public_token, persist the Item, then populate brokerage holdings
 * for that Investments Item. If the user also selected depository accounts in
 * Plaid's OAuth account picker, save those too.
 */
export async function linkBrokerageAccount(
  publicToken: string,
): Promise<BrokerageActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to link an account." };
  }

  const current = async (error: string | null): Promise<BrokerageActionResult> => ({
    accounts: await getCurrentBrokerageBalances(userId),
    error,
  });

  try {
    const exchange = await exchangePublicToken(publicToken);
    const institution = await getInstitution(exchange.accessToken);
    const plaidItemId = await upsertPlaidItem(userId, exchange, institution);
    const brokerageLabel = institution.institutionName ?? "Brokerage";

    const holdings = await getHoldings(exchange.accessToken);
    if (holdings.status === "ready") {
      await saveBrokerageAccounts(
        userId,
        plaidItemId,
        brokerageLabel,
        holdings.accounts,
      );
      await applyItemHoldings(plaidItemId, holdings);
    }

    const depository = await getDepositoryAccounts(exchange.accessToken);
    if (depository.status === "ready" && depository.accounts.length > 0) {
      await saveDepositoryAccounts(
        userId,
        plaidItemId,
        institution.institutionName,
        depository.accounts,
      );
    }

    let error: string | null = null;
    if (holdings.status === "error") error = holdings.message;
    else if (holdings.status === "login_required") {
      error = "Plaid needs you to finish signing in. Please try linking again.";
    }

    revalidatePath("/");
    return current(error);
  } catch (error) {
    return current(plaidActionErrorMessage(error, "Failed to link account."));
  }
}

/**
 * Exchange the public_token, persist the Item, then populate checking/savings
 * balances for that depository Item. If Plaid also initialized Investments for
 * selected brokerage accounts, save those holdings too.
 */
export async function linkDepositoryAccount(
  publicToken: string,
): Promise<DepositoryActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to link an account." };
  }

  const current = async (
    error: string | null,
  ): Promise<DepositoryActionResult> => ({
    accounts: await getUserDepositoryAccounts(userId),
    error,
  });

  try {
    const exchange = await exchangePublicToken(publicToken);
    const institution = await getInstitution(exchange.accessToken);
    const plaidItemId = await upsertPlaidItem(userId, exchange, institution);

    const depository = await getDepositoryAccounts(exchange.accessToken);
    if (depository.status === "ready") {
      await saveDepositoryAccounts(
        userId,
        plaidItemId,
        institution.institutionName,
        depository.accounts,
      );
    }

    const brokerageLabel = institution.institutionName ?? "Brokerage";
    const holdings = await getHoldings(exchange.accessToken);
    if (holdings.status === "ready" && holdings.accounts.length > 0) {
      await saveBrokerageAccounts(
        userId,
        plaidItemId,
        brokerageLabel,
        holdings.accounts,
      );
      await applyItemHoldings(plaidItemId, holdings);
    }

    let error: string | null = null;
    if (depository.status === "error") error = depository.message;
    else if (depository.status === "login_required") {
      error = "Plaid needs you to finish signing in. Please try linking again.";
    }

    revalidatePath("/");
    return current(error);
  } catch (error) {
    return current(plaidActionErrorMessage(error, "Failed to link account."));
  }
}

/**
 * Refresh brokerage holdings for every linked Plaid Item.
 */
export async function loadBrokerageBalances(): Promise<BrokerageActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to view balances." };
  }

  await syncUserBrokerageBalances(userId);
  revalidatePath("/");
  revalidatePath("/brokerage");
  return { accounts: await getCurrentBrokerageBalances(userId), error: null };
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
 * Unlink a Plaid Item and delete all of its accounts (brokerage + depository).
 * Returns the user's remaining brokerage accounts (called from that page).
 */
export async function removeBrokerage(
  plaidItemId: string,
): Promise<BrokerageActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to remove an account." };
  }

  await removeUserPlaidItem(userId, plaidItemId);
  revalidatePath("/");
  return { accounts: await getCurrentBrokerageBalances(userId), error: null };
}

/**
 * Unlink a Plaid Item and delete all of its accounts (brokerage + depository).
 * Returns the user's remaining depository accounts (called from that page).
 */
export async function removeDepository(
  plaidItemId: string,
): Promise<DepositoryActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to remove an account." };
  }

  await removeUserPlaidItem(userId, plaidItemId);
  revalidatePath("/");
  return { accounts: await getUserDepositoryAccounts(userId), error: null };
}

export type AssetGroupActionResult = {
  groups: AssetGroup[];
  error: string | null;
};

async function unauthorizedGroupResult(): Promise<AssetGroupActionResult> {
  return {
    groups: [],
    error: "You must be signed in to manage groups.",
  };
}

export async function createGroup(input: {
  name?: string | null;
  color?: string | null;
  symbols: string[];
}): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  const result = await createAssetGroup(userId, input);
  const groups = await getUserAssetGroups(userId);
  if (result.error) return { groups, error: result.error };

  revalidatePath("/");
  revalidatePath("/on-chain");
  revalidatePath("/exchange");
  revalidatePath("/brokerage");
  return { groups, error: null };
}

export async function updateGroup(
  groupId: string,
  input: { name?: string | null; color?: string | null; symbols: string[] },
): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  const result = await updateAssetGroup(userId, groupId, input);
  const groups = await getUserAssetGroups(userId);
  if (result.error) return { groups, error: result.error };

  revalidatePath("/");
  revalidatePath("/on-chain");
  revalidatePath("/exchange");
  revalidatePath("/brokerage");
  return { groups, error: null };
}

export async function deleteGroup(
  groupId: string,
): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  await removeAssetGroup(userId, groupId);
  const groups = await getUserAssetGroups(userId);

  revalidatePath("/");
  revalidatePath("/on-chain");
  revalidatePath("/exchange");
  revalidatePath("/brokerage");
  return { groups, error: null };
}

export async function loadPortfolioSummary(): Promise<PortfolioAssetSummary> {
  const userId = await getCurrentUserId();
  if (!userId) return emptyPortfolioSummary();

  const wallets = await getUserEvmAccounts(userId);
  if (wallets.length > 0) {
    await syncEvmWalletBalances(wallets);

    const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
    await syncHyperCoreAccounts(hyperCoreAccounts);
  }

  await syncUserKrakenAccounts(userId);
  await syncUserBrokerageBalances(userId);

  return portfolioAssetSummary(await getCurrentPortfolioBalances(userId));
}
