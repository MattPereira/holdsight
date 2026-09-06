"use server";


import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  emptyPortfolioBalancesPageData,
  type PortfolioBalancesPageData
} from "@/lib/portfolio/page-data";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";


export async function loadPortfolioPageData(): Promise<PortfolioBalancesPageData> {
  const userId = await authorizedViewedAccountId("refresh");
  if (!userId) return emptyPortfolioBalancesPageData();

  return refreshPortfolioForUser(userId);
}

