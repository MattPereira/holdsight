import "server-only";

import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import {
  investmentAccountSections,
  type InvestmentAccountSection,
} from "@/lib/portfolio/account-asset-rows";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import {
  getCurrentPortfolioBalanceSnapshot,
  type CurrentPortfolioBalanceSnapshot,
} from "@/lib/portfolio/balances";
import {
  emptyPortfolioTransactionsSnapshot,
  getCurrentPortfolioTransactions,
} from "@/lib/portfolio/transactions";

export type PortfolioAccountsData = {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
  investmentAccountSections: InvestmentAccountSection[];
};

export type PortfolioHomeData = {
  portfolioSummary: ReturnType<typeof portfolioAssetSummary>;
  accountData: PortfolioAccountsData;
  transactions: InvestmentTransactionListItem[];
  transactionHistoryStatus: TransactionHistoryStatus;
};

export function emptyPortfolioAccountsData(): PortfolioAccountsData {
  return {
    accounts: [],
    creditCardAccounts: [],
    manualItems: [],
    investmentAccountSections: [],
  };
}

export function emptyPortfolioHomeData(): PortfolioHomeData {
  const transactions = emptyPortfolioTransactionsSnapshot();
  return {
    portfolioSummary: portfolioAssetSummary([]),
    accountData: emptyPortfolioAccountsData(),
    transactions: transactions.transactions,
    transactionHistoryStatus: transactions.historyStatus,
  };
}

function portfolioAccountsDataFromSnapshot(
  snapshot: CurrentPortfolioBalanceSnapshot,
): PortfolioAccountsData {
  return {
    accounts: snapshot.depositoryAccounts,
    creditCardAccounts: snapshot.creditCardAccounts,
    manualItems: snapshot.manualItems,
    investmentAccountSections: investmentAccountSections({
      walletResults: snapshot.walletResults,
      exchangeResults: snapshot.exchangeResults,
      brokerageAccounts: snapshot.brokerageAccounts,
    }),
  };
}

export async function getCurrentPortfolioHomeData(
  userId: string,
): Promise<PortfolioHomeData> {
  const [snapshot, transactions] = await Promise.all([
    getCurrentPortfolioBalanceSnapshot(userId),
    getCurrentPortfolioTransactions(userId),
  ]);

  return {
    portfolioSummary: portfolioAssetSummary(snapshot.portfolioResults),
    accountData: portfolioAccountsDataFromSnapshot(snapshot),
    transactions: transactions.transactions,
    transactionHistoryStatus: transactions.historyStatus,
  };
}
