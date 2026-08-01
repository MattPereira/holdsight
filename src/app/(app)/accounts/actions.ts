"use server";


import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyPortfolioAccountsData,
  type PortfolioAccountsData
} from "@/lib/portfolio/page-data";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";


export async function loadAccountsPageData(): Promise<PortfolioAccountsData> {
  const userId = await getCurrentUserId();
  if (!userId) return emptyPortfolioAccountsData();

  const { accountData } = await refreshPortfolioForUser(userId);
  return accountData;
}
