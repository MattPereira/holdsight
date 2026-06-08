"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/auth/session";
import { getWalletPositions } from "@/lib/evm/client";
import {
  getLatestPositionSnapshots,
  savePositionSnapshot,
} from "@/lib/portfolio/snapshots";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { syncHyperCoreAccounts } from "@/lib/hyper-core/snapshots";
import {
  addUserWallets,
  getUserWallets,
  removeUserWallet,
  validateUserWallets,
  type SavedWallet,
} from "@/lib/evm/wallets";
import type { PositionsResult } from "@/lib/portfolio/types";

export type WalletActionResult = {
  wallets: SavedWallet[];
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

export async function addWallets(input: string): Promise<WalletActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedWalletResult();

  const result = await addUserWallets(userId, input);
  const wallets = await getUserWallets(userId);
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

  await removeUserWallet(userId, address);
  const wallets = await getUserWallets(userId);

  revalidatePath("/");
  return {
    wallets,
    message: "Wallet removed.",
    error: null,
  };
}

/**
 * Fetch positions for every tracked wallet. Called from the client only on a
 * button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially (not in parallel) so we never burst past the
 * per-second rate limit. If we get rate limited, we stop immediately rather than
 * spending more of the limited daily quota on calls that would also fail.
 */
export async function loadPositions(): Promise<PositionsResult[]> {
  // Privacy-first: no portfolio data leaves the server without a valid session.
  const userId = await getCurrentUserId();
  if (!userId) {
    return [
      {
        status: "error",
        address: "AUTH",
        message: "You must be signed in to view positions.",
        httpStatus: 401,
      },
    ];
  }

  const walletConfigError = await validateUserWallets(userId);
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

  const wallets = await getUserWallets(userId);

  for (const wallet of wallets) {
    const result = await getWalletPositions(wallet.address);
    await savePositionSnapshot(wallet.id, result);
    if (result.status === "rate_limited") break;
  }

  const hyperCoreAccounts = await ensureUserHyperCoreAccounts(userId, wallets);
  await syncHyperCoreAccounts(hyperCoreAccounts);

  return getLatestPositionSnapshots(userId);
}
