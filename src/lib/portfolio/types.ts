export type Position = {
  sourcePositionId?: string;
  symbol: string; // "HYPE", "BHYP", "VVV", "DIEM", "USDC", "SGOV", ect..
  name?: string;
  chainId: string;
  contractAddress?: string;
  amount: number; // the amount of the position in the asset's native unit
  priceUsd: number; // 1 unit of the asset in USD
  valueUsd: number; // total USD value of the position
};

export type PositionsResult =
  | { status: "ready"; address: string; positions: Position[] }
  | { status: "indexing"; address: string }
  | { status: "rate_limited"; address: string }
  | { status: "error"; address: string; message: string; httpStatus: number };
