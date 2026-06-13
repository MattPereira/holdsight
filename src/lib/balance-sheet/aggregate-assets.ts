import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
import type { BalancesResult } from "@/lib/portfolio/types";

export type AggregateAssetRow = {
  id: string;
  label: string;
  description: string;
  valueUsd: number;
};

function balancesTotal(results: BalancesResult[]): number {
  return results.reduce(
    (sum, result) =>
      result.status === "ready"
        ? sum +
          result.balances.reduce(
            (balanceSum, balance) => balanceSum + balance.valueUsd,
            0,
          )
        : sum,
    0,
  );
}

function brokerageTotal(accounts: CurrentBrokerageAccount[]): number {
  return accounts.reduce(
    (sum, account) =>
      sum +
      account.balances.reduce(
        (balanceSum, balance) => balanceSum + balance.valueUsd,
        0,
      ),
    0,
  );
}

export function aggregateAssetRows({
  onChainResults,
  exchangeResults,
  brokerageAccounts,
}: {
  onChainResults: BalancesResult[];
  exchangeResults: BalancesResult[];
  brokerageAccounts: CurrentBrokerageAccount[];
}): AggregateAssetRow[] {
  return [
    {
      id: "on-chain",
      label: "On Chain",
      description: "Wallet assets",
      valueUsd: balancesTotal(onChainResults),
    },
    {
      id: "exchange",
      label: "Exchange",
      description: "Exchange assets",
      valueUsd: balancesTotal(exchangeResults),
    },
    {
      id: "brokerage",
      label: "Brokerage",
      description: "Brokerage assets",
      valueUsd: brokerageTotal(brokerageAccounts),
    },
  ].filter((row) => row.valueUsd !== 0);
}
