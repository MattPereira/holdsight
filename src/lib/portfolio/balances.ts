import "server-only";

import {
  getCurrentBrokerageBalances,
  type CurrentBrokerageAccount,
} from "@/lib/brokerage/balances";
import {
  getUserDepositoryAccounts,
  type DepositoryAccountRow,
} from "@/lib/depository/accounts";
import {
  getUserCreditCardAccounts,
  type CreditCardAccountRow,
} from "@/lib/credit-card/accounts";
import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import { getCurrentKrakenBalances } from "@/lib/exchange/kraken/balances";
import { getCurrentEvmBalances } from "@/lib/evm/balances";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreSpotBalancesByAccountId } from "@/lib/hyper-core/balances";
import {
  getUserManualBalanceItems,
  type ManualBalanceItemRow,
} from "@/lib/manual-balance/items";
import type { BalancesResult } from "@/lib/portfolio/types";

function brokerageAccountToBalancesResult(
  account: CurrentBrokerageAccount,
): BalancesResult {
  return {
    status: "ready",
    address: account.label ?? account.institutionName ?? account.brokerage,
    balances: account.balances.map((balance) => {
      const isCash = balance.assetClass === "cash";
      return {
        sourceBalanceId: balance.sourceBalanceId,
        aggregationKey: isCash
          ? `brokerage-cash:${account.id}:${balance.symbol.toUpperCase()}`
          : undefined,
        symbol: balance.symbol,
        name: isCash ? brokerageCashName(account) : balance.name,
        chainId: "brokerage",
        amount: balance.amount,
        priceUsd: balance.priceUsd,
        valueUsd: balance.valueUsd,
      };
    }),
  };
}

function brokerageCashName(account: CurrentBrokerageAccount): string {
  const institutionName = account.institutionName?.trim();
  const accountLabel = account.label?.trim();
  const accountType = account.accountType.trim().toLowerCase();

  if (institutionName && /\bschwab\b/i.test(institutionName)) {
    return accountType.includes("ira") ? "Schwab IRA Cash" : "Schwab Cash";
  }

  return `${accountLabel || institutionName || account.brokerage} Cash`;
}

function depositoryAccountsToBalancesResult(
  accounts: DepositoryAccountRow[],
  creditCardAccounts: CreditCardAccountRow[],
  manualItems: ManualBalanceItemRow[],
): BalancesResult | null {
  const checkingAccounts = accounts.filter(
    (account) => account.kind === "checking" && account.currency === "USD",
  );
  const checkingTotal = checkingAccounts.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  );
  const liabilityTotal =
    creditCardAccounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ) +
    manualItems.reduce(
      (sum, item) => sum + (item.kind === "liability" ? item.amount : 0),
      0,
    );
  const netCash = checkingTotal - liabilityTotal;

  if (netCash === 0) return null;

  return {
    status: "ready",
    address: "Depository",
    balances: [
      {
        sourceBalanceId: "net-cash-usd",
        aggregationKey: `depository-checking:${checkingAccounts
          .map((account) => account.id)
          .sort()
          .join(":")}:net-liabilities`,
        symbol: "USD",
        name: "Net Checking",
        chainId: "depository",
        amount: netCash,
        priceUsd: 1,
        valueUsd: netCash,
      },
    ],
  };
}

function manualAssetsToBalancesResult(
  items: ManualBalanceItemRow[],
): BalancesResult | null {
  const manualAssets = items.filter((item) => item.kind === "asset");
  if (manualAssets.length === 0) return null;

  return {
    status: "ready",
    address: "Manual Assets",
    balances: manualAssets.map((item) => ({
      sourceBalanceId: `manual-asset:${item.id}`,
      aggregationKey: `manual-asset:${item.id}`,
      symbol: item.symbol,
      name: item.name,
      chainId: "manual",
      amount: item.amount,
      priceUsd: 1,
      valueUsd: item.amount,
    })),
  };
}

export async function getCurrentPortfolioBalances(
  userId: string,
): Promise<BalancesResult[]> {
  const [
    evmResults,
    hyperCoreAccounts,
    krakenAccounts,
    brokerageAccounts,
    depositoryAccounts,
    creditCardAccounts,
    manualItems,
  ] = await Promise.all([
    getCurrentEvmBalances(userId),
    getUserHyperCoreAccounts(userId),
    getUserKrakenAccounts(userId),
    getCurrentBrokerageBalances(userId),
    getUserDepositoryAccounts(userId),
    getUserCreditCardAccounts(userId),
    getUserManualBalanceItems(userId),
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
  const depositoryResult = depositoryAccountsToBalancesResult(
    depositoryAccounts,
    creditCardAccounts,
    manualItems,
  );
  const manualAssetsResult = manualAssetsToBalancesResult(manualItems);

  return [
    ...walletResults,
    ...krakenResults,
    ...brokerageResults,
    ...(depositoryResult ? [depositoryResult] : []),
    ...(manualAssetsResult ? [manualAssetsResult] : []),
  ];
}
