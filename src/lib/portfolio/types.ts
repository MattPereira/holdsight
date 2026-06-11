export type InvestmentBalance = {
  sourceBalanceId?: string;
  aggregationKey?: string;
  symbol: string; // "HYPE", "BHYP", "VVV", "DIEM", "USDC", "SGOV", ect..
  name?: string;
  chainId: string;
  contractAddress?: string;
  amount: number; // the amount of the balance in the asset's native unit
  priceUsd: number; // 1 unit of the asset in USD
  valueUsd: number; // total USD value of the balance
};

export type BalancesResult =
  | { status: "ready"; address: string; balances: InvestmentBalance[] }
  | { status: "indexing"; address: string }
  | { status: "rate_limited"; address: string }
  | { status: "error"; address: string; message: string; httpStatus: number };
