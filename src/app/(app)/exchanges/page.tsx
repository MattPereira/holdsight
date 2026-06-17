import { AccountDetailsPage } from "@/components/accounts/account-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import { getCurrentKrakenBalances } from "@/lib/exchange/kraken/balances";

export default async function ExchangePage() {
  const userId = await getCurrentUserId();
  const krakenAccounts = userId ? await getUserKrakenAccounts(userId) : [];
  const balanceResults = await getCurrentKrakenBalances(krakenAccounts);
  const balanceResultsKey = balanceResults
    .map((result) =>
      result.status === "ready"
        ? `${result.address}:${result.balances.length}:${result.balances.reduce(
            (sum, balance) => sum + balance.valueUsd,
            0,
          )}`
        : `${result.address}:${result.status}`,
    )
    .join("|");

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        key={balanceResultsKey}
        initialResults={balanceResults}
        source="kraken"
        title="Exchanges"
      />
    </div>
  );
}
