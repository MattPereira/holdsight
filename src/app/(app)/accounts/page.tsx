import { AccountsPage } from "@/components/accounts/accounts-page";
import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  emptyPortfolioAccountsData,
  getPortfolioAccountsData,
} from "@/lib/portfolio/page-data";

export default async function Accounts() {
  const userId = await authorizedViewedAccountId("read");
  const accountData = userId
    ? await getPortfolioAccountsData(userId)
    : emptyPortfolioAccountsData();

  return <AccountsPage initialData={accountData} />;
}
