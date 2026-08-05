import "server-only";

import { getSchwabConfig, SCHWAB_BROKERAGE_PROVIDER } from "./config";
import type {
  BrokerageAccountHoldings,
  BrokerageAccountTypeValue,
  BrokerageAssetClass,
  BrokerageBalance,
  HoldingsResult,
} from "@/lib/brokerage/types";
import type {
  BrokerageHoldingsProvider,
  BrokerageProviderConnection,
} from "@/lib/brokerage/providers/types";

type SchwabInstrument = {
  assetType?: string;
  cusip?: string;
  symbol?: string;
  uniformSymbol?: string;
  description?: string;
  type?: string;
};

type SchwabPosition = {
  shortQuantity?: number;
  longQuantity?: number;
  averagePrice?: number;
  averageLongPrice?: number;
  taxLotAverageLongPrice?: number;
  marketValue?: number;
  instrument?: SchwabInstrument;
};

type SchwabBalances = {
  cashBalance?: number;
  totalCash?: number;
  cashAvailableForTrading?: number;
  liquidationValue?: number;
};

type SchwabSecuritiesAccount = {
  type?: string;
  accountNumber?: string;
  positions?: SchwabPosition[];
  currentBalances?: SchwabBalances;
  initialBalances?: SchwabBalances;
};

type SchwabAccountResponse = {
  securitiesAccount?: SchwabSecuritiesAccount;
};

type SchwabAccountNumberEntry = {
  accountNumber?: string;
  hashValue?: string;
};

type SchwabUserPreferenceAccount = {
  accountNumber?: string;
  nickName?: string;
  displayAcctId?: string;
  type?: string;
};

type SchwabUserPreferenceResponse =
  | SchwabUserPreferenceAccount[]
  | {
      accounts?: SchwabUserPreferenceAccount[];
    };

type SchwabErrorResponse = {
  message?: string;
  error?: string;
  error_description?: string;
};

function numberOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function schwabErrorMessage(body: SchwabErrorResponse | null): string {
  return (
    body?.error_description ??
    body?.message ??
    body?.error ??
    "Schwab account request failed."
  );
}

function toAccountType(
  accountType: string | undefined,
): BrokerageAccountTypeValue {
  // The accounts endpoint reports account mechanics (CASH/MARGIN), not tax
  // treatment. Keep the current schema default until Schwab exposes subtype
  // metadata through a separate endpoint.
  if (!accountType) return "taxable";
  return "taxable";
}

function toAssetClass(
  instrument: SchwabInstrument | undefined,
): BrokerageAssetClass {
  const assetType = instrument?.assetType?.toUpperCase();
  const instrumentType = instrument?.type?.toUpperCase();

  if (assetType === "EQUITY") return "stock";
  if (assetType === "OPTION") return "derivative";
  if (assetType === "CASH_EQUIVALENT") return "cash";
  if (assetType === "COLLECTIVE_INVESTMENT") {
    return instrumentType === "EXCHANGE_TRADED_FUND" ? "etf" : "other";
  }
  if (assetType === "MUTUAL_FUND") return "etf";

  return "other";
}

function positionSymbol(instrument: SchwabInstrument | undefined): string {
  return (
    instrument?.symbol ??
    instrument?.uniformSymbol ??
    instrument?.cusip ??
    instrument?.description ??
    "UNKNOWN"
  );
}

function positionName(
  instrument: SchwabInstrument | undefined,
): string | undefined {
  return instrument?.description ?? instrument?.uniformSymbol ?? undefined;
}

function positionQuantity(position: SchwabPosition): number {
  return (
    numberOrZero(position.longQuantity) - numberOrZero(position.shortQuantity)
  );
}

function positionPrice(position: SchwabPosition, quantity: number): number {
  if (quantity !== 0 && typeof position.marketValue === "number") {
    return Math.abs(position.marketValue / quantity);
  }
  return numberOrZero(
    position.averagePrice ??
      position.averageLongPrice ??
      position.taxLotAverageLongPrice,
  );
}

function positionCostBasis(
  position: SchwabPosition,
  quantity: number,
): number | undefined {
  const price =
    position.taxLotAverageLongPrice ??
    position.averageLongPrice ??
    position.averagePrice;
  if (typeof price !== "number" || !Number.isFinite(price) || quantity === 0) {
    return undefined;
  }
  return Math.abs(quantity) * price;
}

function positionToBalance(position: SchwabPosition): BrokerageBalance | null {
  const quantity = positionQuantity(position);
  const marketValue = numberOrZero(position.marketValue);
  if (quantity === 0 && marketValue === 0) return null;

  const instrument = position.instrument;
  const symbol = positionSymbol(instrument);

  return {
    sourceBalanceId: instrument?.cusip ?? symbol,
    symbol,
    name: positionName(instrument),
    assetClass: toAssetClass(instrument),
    amount: quantity,
    priceUsd: positionPrice(position, quantity),
    valueUsd: marketValue,
    costBasisUsd: positionCostBasis(position, quantity),
  };
}

function cashBalance(account: SchwabSecuritiesAccount): BrokerageBalance | null {
  const balances = account.currentBalances ?? account.initialBalances;
  const cash =
    balances?.cashBalance ??
    balances?.totalCash ??
    balances?.cashAvailableForTrading ??
    0;

  if (!Number.isFinite(cash) || cash === 0) return null;

  return {
    sourceBalanceId: "schwab:cash",
    symbol: "USD",
    name: "Cash",
    assetClass: "cash",
    amount: cash,
    priceUsd: 1,
    valueUsd: cash,
  };
}

function accountLabel(
  account: SchwabSecuritiesAccount,
  preference: SchwabUserPreferenceAccount | undefined,
): string {
  const nickname = preference?.nickName?.trim();
  if (nickname) return nickname;

  const displayId = preference?.displayAcctId?.trim();
  if (displayId) return `Schwab ${displayId}`;

  return `Schwab ${account.accountNumber?.slice(-4) ?? "Account"}`;
}

function normalizeAccount(
  row: SchwabAccountResponse,
  preferencesByAccountNumber: Map<string, SchwabUserPreferenceAccount>,
  hashesByAccountNumber: Map<string, string>,
): BrokerageAccountHoldings | null {
  const account = row.securitiesAccount;
  if (!account?.accountNumber) return null;

  // SECURITY: `externalAccountId` is persisted, so it must be Schwab's opaque
  // hashValue rather than the real account number. Skip the account when no
  // hash is available — falling back to the account number would store it.
  const externalAccountId = hashesByAccountNumber.get(account.accountNumber);
  if (!externalAccountId) return null;

  const preference = preferencesByAccountNumber.get(account.accountNumber);

  const balances = (account.positions ?? [])
    .map(positionToBalance)
    .filter((balance): balance is BrokerageBalance => Boolean(balance));
  const cash = cashBalance(account);
  if (cash) balances.push(cash);

  return {
    externalAccountId,
    accountName: accountLabel(account, preference),
    accountType: toAccountType(account.type),
    mask: account.accountNumber.slice(-4),
    balances,
  };
}

function userPreferenceAccounts(
  body: SchwabUserPreferenceResponse | null,
): SchwabUserPreferenceAccount[] {
  if (Array.isArray(body)) return body;
  return body?.accounts ?? [];
}

async function getSchwabUserPreferenceAccounts(
  accessToken: string,
): Promise<SchwabUserPreferenceAccount[]> {
  const response = await fetch(getSchwabConfig().userPreferenceUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) return [];

  const body = (await response.json().catch(() => null)) as
    | SchwabUserPreferenceResponse
    | null;
  return userPreferenceAccounts(body);
}

/**
 * Map each account number to Schwab's opaque `hashValue`. Schwab exposes this
 * so callers can reference an account without handling its real number; it is
 * the only account identifier we persist.
 */
async function getSchwabAccountHashes(
  accessToken: string,
): Promise<Map<string, string>> {
  const response = await fetch(getSchwabConfig().accountNumbersUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) return new Map();

  const body = (await response.json().catch(() => null)) as
    | SchwabAccountNumberEntry[]
    | null;

  return new Map(
    (Array.isArray(body) ? body : []).flatMap((entry) =>
      entry.accountNumber && entry.hashValue
        ? [[entry.accountNumber, entry.hashValue] as const]
        : [],
    ),
  );
}

export async function getSchwabHoldings(
  accessToken: string,
): Promise<HoldingsResult> {
  const url = new URL(getSchwabConfig().accountsUrl);
  url.searchParams.set("fields", "positions");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const body = (await response.json().catch(() => null)) as
    | SchwabAccountResponse[]
    | SchwabErrorResponse
    | null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { status: "login_required" };
    }
    return {
      status: "error",
      message: schwabErrorMessage(
        body && !Array.isArray(body) ? body : null,
      ),
      httpStatus: response.status,
    };
  }

  if (!Array.isArray(body)) {
    return {
      status: "error",
      message: "Schwab account response was not an account list.",
      httpStatus: response.status,
    };
  }

  const [preferenceAccounts, hashesByAccountNumber] = await Promise.all([
    getSchwabUserPreferenceAccounts(accessToken),
    getSchwabAccountHashes(accessToken),
  ]);

  const preferencesByAccountNumber = new Map(
    preferenceAccounts.flatMap((preference) =>
      preference.accountNumber
        ? [[preference.accountNumber, preference] as const]
        : [],
    ),
  );

  return {
    status: "ready",
    accounts: body
      .map((account) =>
        normalizeAccount(
          account,
          preferencesByAccountNumber,
          hashesByAccountNumber,
        ),
      )
      .filter((account): account is BrokerageAccountHoldings =>
        Boolean(account),
      ),
  };
}

export const schwabBrokerageProvider: BrokerageHoldingsProvider = {
  id: SCHWAB_BROKERAGE_PROVIDER,
  getHoldings(connection: BrokerageProviderConnection) {
    return getSchwabHoldings(connection.accessToken);
  },
};
