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
  normalizePlaidAccountFamilies,
  readPlaidError,
  type PlaidAccountFamily,
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
  getUserCreditCardAccounts,
  saveCreditCardAccounts,
  type CreditCardAccountRow,
} from "@/lib/credit-card/accounts";
import { getCreditCardAccounts } from "@/lib/credit-card/client";
import { syncUserCreditCardAccounts } from "@/lib/credit-card/balances";
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
    | Awaited<ReturnType<typeof getHoldings>>
    | Awaited<ReturnType<typeof getDepositoryAccounts>>
    | Awaited<ReturnType<typeof getCreditCardAccounts>>,
): string | null {
  if (result.status === "error") return result.message;
  if (result.status === "login_required") {
    return "Plaid needs you to finish signing in. Please try linking again.";
  }
  return null;
}

async function createPlaidLinkTokenForFamilies(
  familiesInput: readonly string[],
): Promise<PlaidLinkTokenActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { linkToken: null, error: "You must be signed in to link an account." };
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
        if (accounts.length > 0) {
          await saveDepositoryAccounts(
            userId,
            plaidItemId,
            institution.institutionName,
            accounts,
          );
        }
      } else if (
        errorFamilies.includes("checking") ||
        errorFamilies.includes("savings")
      ) {
        const message = plaidResultError(depository);
        if (message) errors.push(message);
      }
    }

    if (families.includes("brokerage")) {
      const holdings = await getHoldings(exchange.accessToken);
      if (holdings.status === "ready" && holdings.accounts.length > 0) {
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
    revalidatePath("/brokerage");
    revalidatePath("/banking");
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

/**
 * Unlink a Plaid Item and delete all of its accounts.
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
 * Unlink a Plaid Item and delete all of its accounts.
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

/**
 * Unlink a Plaid Item and delete all of its accounts.
 * Returns the user's remaining credit-card accounts.
 */
export async function removeCreditCard(
  plaidItemId: string,
): Promise<CreditCardActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { accounts: [], error: "You must be signed in to remove an account." };
  }

  await removeUserPlaidItem(userId, plaidItemId);
  revalidatePath("/");
  return { accounts: await getUserCreditCardAccounts(userId), error: null };
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
  await syncUserDepositoryBalances(userId);
  await syncUserCreditCardAccounts(userId);

  return portfolioAssetSummary(await getCurrentPortfolioBalances(userId));
}
