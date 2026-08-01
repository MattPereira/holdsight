"use server";


import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyPortfolioBalancesPageData,
  type PortfolioBalancesPageData
} from "@/lib/portfolio/page-data";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";


export async function loadPortfolioPageData(): Promise<PortfolioBalancesPageData> {
  const userId = await getCurrentUserId();
  if (!userId) return emptyPortfolioBalancesPageData();

  return refreshPortfolioForUser(userId);
}

