import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
import type { BalancesResult } from "@/lib/portfolio/types";

export type InvestmentAccountSection = {
  id: string;
  label: string;
  description: string;
  valueUsd: number;
  children: InvestmentAccountRow[];
};

export type InvestmentAccountRow = {
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

function readyBalanceTotal(result: BalancesResult): number {
  return result.status === "ready"
    ? result.balances.reduce((sum, balance) => sum + balance.valueUsd, 0)
    : 0;
}

function resultRows(
  results: BalancesResult[],
  description: string,
): InvestmentAccountRow[] {
  return results
    .map((result, index) => ({
      id: `${result.address}:${index}`,
      label: result.address,
      description,
      valueUsd: readyBalanceTotal(result),
    }))
    .filter((row) => row.valueUsd !== 0);
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

function brokerageLabel(account: CurrentBrokerageAccount): string {
  return account.label ?? account.institutionName ?? account.brokerage;
}

function brokerageDescription(account: CurrentBrokerageAccount): string {
  const institutionName = account.institutionName?.trim();
  const accountType = account.accountType.trim();

  if (institutionName && accountType) {
    return `${institutionName} ${accountType}`;
  }

  return accountType || "Brokerage account";
}

function brokerageRows(
  accounts: CurrentBrokerageAccount[],
): InvestmentAccountRow[] {
  return accounts
    .map((account) => ({
      id: account.id,
      label: brokerageLabel(account),
      description: brokerageDescription(account),
      valueUsd: account.balances.reduce(
        (sum, balance) => sum + balance.valueUsd,
        0,
      ),
    }))
    .filter((row) => row.valueUsd !== 0);
}

export function investmentAccountSections({
  onChainResults,
  exchangeResults,
  brokerageAccounts,
}: {
  onChainResults: BalancesResult[];
  exchangeResults: BalancesResult[];
  brokerageAccounts: CurrentBrokerageAccount[];
}): InvestmentAccountSection[] {
  return [
    {
      id: "on-chain",
      label: "On Chain",
      description: "Wallet assets",
      valueUsd: balancesTotal(onChainResults),
      children: resultRows(onChainResults, "Wallet assets"),
    },
    {
      id: "exchange",
      label: "Exchange",
      description: "Exchange assets",
      valueUsd: balancesTotal(exchangeResults),
      children: resultRows(exchangeResults, "Exchange assets"),
    },
    {
      id: "brokerage",
      label: "Brokerage",
      description: "Brokerage assets",
      valueUsd: brokerageTotal(brokerageAccounts),
      children: brokerageRows(brokerageAccounts),
    },
  ].filter((row) => row.valueUsd !== 0);
}
