import type { HoldingsResult } from "@/lib/brokerage/types";

export type BrokerageProviderId = "plaid" | "schwab";

export type BrokerageProviderConnection = {
  provider: BrokerageProviderId;
  accessToken: string;
};

export type BrokerageHoldingsProvider = {
  id: BrokerageProviderId;
  getHoldings(connection: BrokerageProviderConnection): Promise<HoldingsResult>;
};
