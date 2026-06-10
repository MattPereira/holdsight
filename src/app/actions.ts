"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getCurrentEvmPositions,
  syncEvmWalletPositions,
} from "@/lib/evm/positions";
import { getCurrentPortfolioPositions } from "@/lib/portfolio/positions";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import {
  getCurrentHyperCorePositions,
  syncHyperCoreAccounts,
} from "@/lib/hyper-core/positions";
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
import type { PositionsResult } from "@/lib/portfolio/types";

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

function unauthorizedPositionsResult(): PositionsResult[] {
  return [
    {
      status: "error",
      address: "AUTH",
      message: "You must be signed in to view positions.",
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
 * Fetch EVM positions for every tracked wallet. Called from the client only on
 * a button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially (not in parallel) so we never burst past the
 * per-second rate limit. If we get rate limited, we stop immediately rather than
 * spending more of the limited daily quota on calls that would also fail.
 */
export async function loadEvmPositions(): Promise<PositionsResult[]> {
  // Privacy-first: no portfolio data leaves the server without a valid session.
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedPositionsResult();

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
  await syncEvmWalletPositions(wallets);

  return getCurrentEvmPositions(userId);
}

export async function loadHyperCorePositions(): Promise<PositionsResult[]> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedPositionsResult();

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

  return getCurrentHyperCorePositions(hyperCoreAccounts);
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
  await syncEvmWalletPositions(wallets);

  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);

  return portfolioAssetSummary(await getCurrentPortfolioPositions(userId));
}
