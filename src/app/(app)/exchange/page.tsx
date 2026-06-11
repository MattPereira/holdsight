import { AccountDetailsPage } from "@/components/account-details-page";
import { KrakenCredentialsForm } from "@/components/kraken-credentials-form";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import { getCurrentKrakenBalances } from "@/lib/exchange/kraken/balances";
import { getUserAssetGroups } from "@/lib/portfolio/groups";

export default async function ExchangePage() {
  const userId = await getCurrentUserId();
  const [krakenAccounts, groups] = userId
    ? await Promise.all([getUserKrakenAccounts(userId), getUserAssetGroups(userId)])
    : [[], []];
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
        title="Exchange"
        headerAction={<KrakenCredentialsForm accounts={krakenAccounts} />}
        initialGroups={groups}
      />
    </div>
  );
}
