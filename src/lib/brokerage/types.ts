import type { brokerageAccountType } from "@/db/schema/investment-accounts";

export type BrokerageAccountTypeValue =
  (typeof brokerageAccountType.enumValues)[number];

export type BrokerageAssetClass =
  | "stock"
  | "etf"
  | "cash"
  | "crypto"
  | "derivative"
  | "other";

// One holding (a position in a single security, or a cash balance) within a
// brokerage account. Mirrors the EVM `InvestmentBalance` shape, minus the
// chain-specific fields, plus an asset class so we can store the right enum.
export type BrokerageBalance = {
  sourceBalanceId?: string; // Provider ID, scoped to its brokerage account
  symbol: string; // ticker (e.g. "VOO"), or currency code for cash
  name?: string;
  assetClass: BrokerageAssetClass;
  amount: number; // quantity held (or cash amount)
  priceUsd: number; // price per unit
  valueUsd: number; // total USD value of the holding
  costBasisUsd?: number; // total cost basis, when Plaid reports it
};

// One brokerage account exposed by a Plaid Item (e.g. a single Schwab Roth IRA).
export type BrokerageAccountHoldings = {
  // Opaque provider-side account ID (Plaid account_id, Schwab hashValue).
  // SECURITY: never the institution's real account number — this is persisted
  // to brokerage_accounts.external_account_id. Use `mask` for display.
  externalAccountId: string;
  accountName: string;
  accountType: BrokerageAccountTypeValue;
  mask: string | null; // last 4 digits, when the provider supplies them
  balances: BrokerageBalance[];
};

// Result of fetching holdings for a whole Plaid Item (which can span multiple
// brokerage accounts). `login_required` means the user must re-auth via Link.
export type HoldingsResult =
  | { status: "ready"; accounts: BrokerageAccountHoldings[] }
  | { status: "login_required" }
  | { status: "error"; message: string; httpStatus: number };
