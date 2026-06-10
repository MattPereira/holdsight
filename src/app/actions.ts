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
import {
  addUserEvmAccounts,
  getUserEvmAccounts,
  removeUserEvmAccount,
  validateUserEvmAccounts,
  type SavedEvmAccount,
} from "@/lib/evm/accounts";
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
  symbols: string[];
}): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  const result = await createAssetGroup(userId, input);
  const groups = await getUserAssetGroups(userId);
  if (result.error) return { groups, error: result.error };

  revalidatePath("/");
  return { groups, error: null };
}

export async function updateGroup(
  groupId: string,
  input: { name?: string | null; symbols: string[] },
): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  const result = await updateAssetGroup(userId, groupId, input);
  const groups = await getUserAssetGroups(userId);
  if (result.error) return { groups, error: result.error };

  revalidatePath("/");
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
  return { groups, error: null };
}

export async function loadPortfolioSummary(): Promise<PortfolioAssetSummary> {
  const userId = await getCurrentUserId();
  if (!userId) return emptyPortfolioSummary();

  const walletConfigError = await validateUserEvmAccounts(userId);
  if (walletConfigError) return emptyPortfolioSummary();

  const wallets = await getUserEvmAccounts(userId);
  await syncEvmWalletBalances(wallets);

  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);

  return portfolioAssetSummary(await getCurrentPortfolioBalances(userId));
}
