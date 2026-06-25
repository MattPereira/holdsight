import "server-only";

export {
  getPlaidHoldings as getHoldings,
  getPlaidInvestmentTransactionsPage as getInvestmentTransactionsPage,
  plaidBrokerageProvider,
  PLAID_BROKERAGE_PROVIDER,
  type PlaidBrokerageTransactionsPageResult as BrokerageTransactionsPageResult,
} from "@/lib/brokerage/providers/plaid/client";
