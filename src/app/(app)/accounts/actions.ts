"use server";

import { revalidatePath } from "next/cache";

import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  getUserCreditCardAccounts,
  type CreditCardAccountRow,
} from "@/lib/credit-card/accounts";
import { syncUserCreditCardAccounts } from "@/lib/credit-card/balances";
import {
  getUserDepositoryAccounts,
  type DepositoryAccountRow,
} from "@/lib/depository/accounts";
import { syncUserDepositoryBalances } from "@/lib/depository/balances";
import {
  emptyPortfolioAccountsData,
  type PortfolioAccountsData
} from "@/lib/portfolio/page-data";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";

export type DepositoryActionResult = {
  accounts: DepositoryAccountRow[];
  error: string | null;
};

export type CreditCardActionResult = {
  accounts: CreditCardAccountRow[];
  error: string | null;
};

export async function loadAccountsPageData(): Promise<PortfolioAccountsData> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) return emptyPortfolioAccountsData();

  const { accountData } = await refreshPortfolioForUser(userId);
  return accountData;
}

/**
 * Refresh depository (checking/savings) balances for every linked Plaid Item.
 */
export async function loadDepositoryBalances(): Promise<DepositoryActionResult> {
  const userId = await authorizedViewedAccountId("refresh");
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
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) {
    return { accounts: [], error: "You must be signed in to view balances." };
  }

  await syncUserCreditCardAccounts(userId);
  revalidatePath("/");
  return { accounts: await getUserCreditCardAccounts(userId), error: null };
}
