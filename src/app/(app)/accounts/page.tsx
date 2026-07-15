import { AccountsPage } from "@/components/accounts/accounts-page";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyPortfolioAccountsData,
  getPortfolioAccountsData,
} from "@/lib/portfolio/page-data";

export default async function Accounts() {
  const userId = await getCurrentUserId();
  const accountData = userId
    ? await getPortfolioAccountsData(userId)
    : emptyPortfolioAccountsData();

  return <AccountsPage initialData={accountData} />;
}
