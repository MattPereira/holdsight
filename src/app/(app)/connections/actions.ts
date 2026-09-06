"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";

import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  saveBrokerageAccounts
} from "@/lib/brokerage/accounts";
import {
  applyItemHoldings,
  getCurrentBrokerageBalances,
  type CurrentBrokerageAccount
} from "@/lib/brokerage/balances";
import {
  getUserSchwabConnections,
  removeUserSchwabConnection,
} from "@/lib/brokerage/connections";
import { getPlaidHoldings } from "@/lib/brokerage/providers/plaid/client";
import { isSchwabConfigured } from "@/lib/brokerage/providers/schwab/config";
import {
  getUserCreditCardAccounts,
  saveCreditCardAccounts,
  type CreditCardAccountRow,
} from "@/lib/credit-card/accounts";
import { getCreditCardAccounts } from "@/lib/credit-card/client";
import {
  getUserDepositoryAccounts,
  saveDepositoryAccounts,
  type DepositoryAccountRow,
} from "@/lib/depository/accounts";
import {
  addUserEvmAccount,
  getUserEvmAccounts,
  removeUserEvmAccount,
  renameUserEvmAccount,
  type SavedEvmAccount
} from "@/lib/evm/accounts";
import {
  getUserKrakenAccounts,
  removeUserKrakenAccount,
  saveUserKrakenCredentials,
  type SavedKrakenAccount
} from "@/lib/exchange/kraken/accounts";
import {
  syncKrakenAccounts
} from "@/lib/exchange/kraken/balances";
import {
  claimInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease
} from "@/lib/investment-transactions/ingestion";
import {
  connectLighterAccount,
  getUserLighterAccounts,
  removeLighterAccount,
  type SavedLighterAccount,
} from "@/lib/lighter/accounts";
import {
  syncLighterAccounts
} from "@/lib/lighter/balances";
import {
  createManualBalanceItem,
  getUserManualBalanceItems,
  removeUserManualBalanceItem,
  updateUserManualBalanceItem,
  type ManualBalanceItemInput,
  type ManualBalanceItemRow,
} from "@/lib/manual-balance/items";
import {
  createLinkToken,
  exchangePublicToken,
  getDepositoryAccounts,
  getInstitution,
  normalizePlaidAccountFamilies,
  readPlaidError,
  type PlaidAccountFamily
} from "@/lib/plaid/client";
import {
  getUserPlaidItems,
  PlaidRevokeError,
  removeUserPlaidItem,
  upsertPlaidItem
} from "@/lib/plaid/items";
import { syncLighterTransactionHistory } from "@/workflows/lighter-transaction-sync";


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

export async function addWallets(
  address: string,
  label: string,
): Promise<WalletActionResult> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
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

export type KrakenCredentialsActionResult = {
  message: string;
  error: string | null;
};

export async function saveKrakenCredentials(input: {
  apiKey: string;
  apiSecret: string;
}): Promise<KrakenCredentialsActionResult> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
): Promise<{ error: string | null; }> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
}): Promise<{ message: string; error: string | null; }> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
        await start(syncLighterTransactionHistory, [userId, account.id, leaseToken]);
      } catch (error) {
        await releaseInvestmentTransactionSyncLease({
          userId,
          investmentAccountId: account.id,
          provider: "lighter",
          leaseToken,
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
): Promise<{ error: string | null; }> {
  const userId = await authorizedViewedAccountId("manageConnections");
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

async function createPlaidLinkTokenForFamilies(
  familiesInput: readonly string[],
): Promise<PlaidLinkTokenActionResult> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
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

/* ----------------------- account connections hub ----------------------- */

export type AccountConnectionsResult = {
  wallets: SavedEvmAccount[];
  lighterAccounts: SavedLighterAccount[];
  krakenAccounts: SavedKrakenAccount[];
  plaidItems: PlaidConnectionSummary[];
  schwabConnections: SchwabConnectionSummary[];
  schwabConfigured: boolean;
  manualItems: ManualBalanceItemRow[];
  error: string | null;
};

export type PlaidConnectionSummary = {
  id: string;
  institutionName: string | null;
  status: "active" | "login_required" | "error" | "disabled";
  accountNames?: string[];
};

export type SchwabConnectionSummary = {
  id: string;
  institutionName: string | null;
  status: "active" | "login_required" | "error" | "disabled";
};

function plaidConnectionSummary(
  item: Awaited<ReturnType<typeof getUserPlaidItems>>[number],
): PlaidConnectionSummary {
  return {
    id: item.id,
    institutionName: item.institutionName,
    status: item.status,
    accountNames: item.accountNames,
  };
}

function schwabConnectionSummary(
  connection: Awaited<ReturnType<typeof getUserSchwabConnections>>[number],
): SchwabConnectionSummary {
  return {
    id: connection.id,
    institutionName: connection.institutionName,
    status: connection.status,
  };
}

/**
 * Load every connection the user manages, for the centralized connect sheet.
 * Fetched lazily when the sheet opens rather than on every page render.
 */
export async function getAccountConnections(): Promise<AccountConnectionsResult> {
  const userId = await authorizedViewedAccountId("read");
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
    plaidItems: plaidItems.map(plaidConnectionSummary),
    schwabConnections: schwabConnections.map(schwabConnectionSummary),
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
): Promise<{ plaidItems: PlaidConnectionSummary[]; error: string | null; }> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
        plaidItems: (await getUserPlaidItems(userId)).map(plaidConnectionSummary),
        error: PLAID_REVOKE_RETRY_MESSAGE,
      };
    }
    throw error;
  }
  revalidatePath("/");
  return {
    plaidItems: (await getUserPlaidItems(userId)).map(plaidConnectionSummary),
    error: null,
  };
}

export async function removeSchwabConnection(
  connectionId: string,
): Promise<{
  schwabConnections: SchwabConnectionSummary[];
  error: string | null;
}> {
  const userId = await authorizedViewedAccountId("manageConnections");
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
    schwabConnections: (await getUserSchwabConnections(userId)).map(
      schwabConnectionSummary,
    ),
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
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
  if (!userId) return unauthorizedManualBalanceResult();

  await removeUserManualBalanceItem(userId, itemId);
  const items = await getUserManualBalanceItems(userId);

  revalidatePath("/");
  return { items, error: null };
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
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
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
  const userId = await authorizedViewedAccountId("manageConnections");
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
