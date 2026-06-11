import "server-only";

import {
  getCurrentBrokerageBalances,
  type CurrentBrokerageAccount,
} from "@/lib/brokerage/balances";
import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import { getCurrentKrakenBalances } from "@/lib/exchange/kraken/balances";
import { getCurrentEvmBalances } from "@/lib/evm/balances";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreSpotBalancesByAccountId } from "@/lib/hyper-core/balances";
import type { BalancesResult } from "@/lib/portfolio/types";

function brokerageAccountToBalancesResult(
  account: CurrentBrokerageAccount,
): BalancesResult {
  return {
    status: "ready",
    address: account.label ?? account.institutionName ?? account.brokerage,
    balances: account.balances.map((balance) => ({
      sourceBalanceId: balance.sourceBalanceId,
      symbol: balance.symbol,
      name: balance.name,
      chainId: "brokerage",
      amount: balance.amount,
      priceUsd: balance.priceUsd,
      valueUsd: balance.valueUsd,
    })),
  };
}

export async function getCurrentPortfolioBalances(
  userId: string,
): Promise<BalancesResult[]> {
  const [evmResults, hyperCoreAccounts, krakenAccounts, brokerageAccounts] =
    await Promise.all([
      getCurrentEvmBalances(userId),
      getUserHyperCoreAccounts(userId),
      getUserKrakenAccounts(userId),
      getCurrentBrokerageBalances(userId),
    ]);
  const hyperCoreAccountByAddress = new Map(
    hyperCoreAccounts.map((account) => [account.address, account]),
  );

  const walletResults = await Promise.all(
    evmResults.map(async (result) => {
      const hyperCoreAccount = hyperCoreAccountByAddress.get(result.address);
      const hyperCoreSpotBalances = hyperCoreAccount
        ? await getCurrentHyperCoreSpotBalancesByAccountId(hyperCoreAccount.id)
        : [];

      if (result.status !== "ready") return result;

      return {
        ...result,
        balances: [...result.balances, ...hyperCoreSpotBalances].sort(
          (a, b) => b.valueUsd - a.valueUsd,
        ),
      };
    }),
  );
  const krakenResults = await getCurrentKrakenBalances(krakenAccounts);
  const brokerageResults = brokerageAccounts.map(
    brokerageAccountToBalancesResult,
  );

  return [...walletResults, ...krakenResults, ...brokerageResults];
}
