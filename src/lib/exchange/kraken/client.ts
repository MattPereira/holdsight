import "server-only";

import { createHash, createHmac } from "crypto";
import type { InvestmentBalance } from "@/lib/portfolio/types";

const KRAKEN_API_BASE_URL =
  process.env.KRAKEN_API_BASE_URL ?? "https://api.kraken.com";

const KRAKEN_PRIVATE_BALANCE_PATH = "/0/private/BalanceEx";
const KRAKEN_PRIVATE_TRADES_HISTORY_PATH = "/0/private/TradesHistory";
const KRAKEN_PUBLIC_ASSET_PAIRS_PATH = "/0/public/AssetPairs";
const KRAKEN_PUBLIC_TICKER_PATH = "/0/public/Ticker";

const CASH_SYMBOLS = new Set(["USD", "USDT", "USDC"]);

export type KrakenCredentials = {
  apiKey: string;
  apiSecret: string;
};

type KrakenApiResponse<T> = {
  error?: string[];
  result?: T;
};

type KrakenExtendedBalanceEntry = {
  balance?: string;
  credit?: string;
  credit_used?: string;
  hold_trade?: string;
};

export type KrakenAssetPair = {
  altname?: string;
  wsname?: string;
  base?: string;
  quote?: string;
  status?: string;
};

type KrakenTicker = {
  c?: [string, string];
  a?: [string, string, string];
  b?: [string, string, string];
};

export type KrakenBalance = InvestmentBalance & {
  assetClass: "crypto" | "cash";
};

export type KrakenTrade = {
  ordertxid?: string;
  pair?: string;
  time?: number;
  type?: "buy" | "sell";
  ordertype?: string;
  price?: string;
  cost?: string;
  fee?: string;
  vol?: string;
  margin?: string;
  misc?: string;
  trade_id?: number;
  maker?: boolean;
};

type KrakenTradesHistory = {
  trades: Record<string, KrakenTrade>;
  count?: number;
};

export type KrakenBalancesResult =
  | {
      status: "ready";
      address: string;
      balances: KrakenBalance[];
    }
  | { status: "rate_limited"; address: string }
  | { status: "error"; address: string; message: string; httpStatus: number };

type UsdMarket = {
  pairKey: string;
  displayPair: string;
  base: string;
  quote: string;
};

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function krakenApiError(errors: string[] | undefined, fallback: string): string {
  if (!errors || errors.length === 0) return fallback;
  return errors.join("; ");
}

function krakenApiSign(
  path: string,
  body: URLSearchParams,
  apiSecret: string,
): string {
  const nonce = body.get("nonce") ?? "";
  const encodedBody = body.toString();
  const sha256 = createHash("sha256")
    .update(nonce + encodedBody)
    .digest();
  const hmacPayload = Buffer.concat([Buffer.from(path), sha256]);

  return createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(hmacPayload)
    .digest("base64");
}

async function readKrakenJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const data = (await response.json()) as KrakenApiResponse<T>;

  if (!response.ok || (data.error && data.error.length > 0)) {
    throw Object.assign(
      new Error(krakenApiError(data.error, `${fallback} (${response.status})`)),
      { httpStatus: response.status || 502 },
    );
  }

  if (data.result === undefined) {
    throw Object.assign(new Error(fallback), { httpStatus: response.status || 502 });
  }

  return data.result;
}

async function krakenPrivatePost<T>(
  path: string,
  credentials: KrakenCredentials,
  params: Record<string, string> = {},
): Promise<T> {
  const body = new URLSearchParams({
    nonce: Date.now().toString(),
    ...params,
  });

  const response = await fetch(`${KRAKEN_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "API-Key": credentials.apiKey,
      "API-Sign": krakenApiSign(path, body, credentials.apiSecret),
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  return readKrakenJson<T>(response, "Kraken private API error");
}

async function krakenPublicGet<T>(
  path: string,
  params?: URLSearchParams,
): Promise<T> {
  const query = params?.toString();
  const response = await fetch(
    `${KRAKEN_API_BASE_URL}${path}${query ? `?${query}` : ""}`,
    {
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );

  return readKrakenJson<T>(response, "Kraken public API error");
}

export function normalizeKrakenAssetSymbol(asset: string): string {
  const base = asset
    .trim()
    .replace(/^X(?=[A-Z0-9]{3,}$)/, "")
    .replace(/^Z(?=[A-Z0-9]{3,}$)/, "")
    .replace(/\..*$/, "");

  if (base === "XBT") return "BTC";
  return base;
}

function isCashSymbol(symbol: string): boolean {
  return CASH_SYMBOLS.has(symbol);
}

function tickerPriceUsd(ticker: KrakenTicker): number | null {
  const closed = toNumber(ticker.c?.[0]);
  if (closed > 0) return closed;

  const ask = toNumber(ticker.a?.[0]);
  const bid = toNumber(ticker.b?.[0]);
  if (ask > 0 && bid > 0) return (ask + bid) / 2;
  if (ask > 0) return ask;
  if (bid > 0) return bid;
  return null;
}

function assetPairDisplayName(pairKey: string, pair: KrakenAssetPair): string {
  return pair.altname ?? pair.wsname?.replace("/", "") ?? pairKey;
}

function chooseUsdMarket(
  symbol: string,
  markets: UsdMarket[],
): UsdMarket | null {
  return markets.find(
    (market) => market.base === symbol && market.quote === "USD",
  ) ?? null;
}

export async function fetchKrakenExtendedBalances(
  credentials: KrakenCredentials,
): Promise<Record<string, KrakenExtendedBalanceEntry>> {
  return krakenPrivatePost<Record<string, KrakenExtendedBalanceEntry>>(
    KRAKEN_PRIVATE_BALANCE_PATH,
    credentials,
  );
}

export async function fetchKrakenUsdMarkets(): Promise<UsdMarket[]> {
  const result = await krakenPublicGet<Record<string, KrakenAssetPair>>(
    KRAKEN_PUBLIC_ASSET_PAIRS_PATH,
    new URLSearchParams({ assetVersion: "1" }),
  );

  return Object.entries(result).flatMap(([pairKey, pair]) => {
    const base = normalizeKrakenAssetSymbol(pair.base ?? "");
    const quote = normalizeKrakenAssetSymbol(pair.quote ?? "");
    if (!base || quote !== "USD") return [];
    if (pair.status && pair.status !== "online") return [];

    return [
      {
        pairKey,
        displayPair: assetPairDisplayName(pairKey, pair),
        base,
        quote,
      },
    ];
  });
}

export async function fetchKrakenTickerPrices(
  markets: UsdMarket[],
): Promise<Map<string, number>> {
  if (markets.length === 0) return new Map();

  const result = await krakenPublicGet<Record<string, KrakenTicker>>(
    KRAKEN_PUBLIC_TICKER_PATH,
    new URLSearchParams({
      pair: markets.map((market) => market.displayPair).join(","),
      assetVersion: "1",
    }),
  );

  const priceByPair = new Map<string, number>();
  for (const [pairKey, ticker] of Object.entries(result)) {
    const price = tickerPriceUsd(ticker);
    if (price !== null) priceByPair.set(pairKey, price);
  }

  return priceByPair;
}

export async function fetchKrakenBalances(
  credentials: KrakenCredentials,
): Promise<KrakenBalancesResult> {
  const address = "Kraken";

  try {
    const [rawBalances, markets] = await Promise.all([
      fetchKrakenExtendedBalances(credentials),
      fetchKrakenUsdMarkets(),
    ]);
    const balancesWithAmount = Object.entries(rawBalances)
      .map(([asset, balance]) => ({
        asset,
        symbol: normalizeKrakenAssetSymbol(asset),
        amount: toNumber(balance.balance),
      }))
      .filter((balance) => balance.amount > 0);

    const neededMarkets = balancesWithAmount.flatMap((balance) => {
      if (isCashSymbol(balance.symbol)) return [];
      const market = chooseUsdMarket(balance.symbol, markets);
      return market ? [market] : [];
    });
    const priceByPair = await fetchKrakenTickerPrices(neededMarkets);

    const balances = balancesWithAmount.flatMap<KrakenBalance>((balance) => {
      if (isCashSymbol(balance.symbol)) {
        return [{
          sourceBalanceId: `kraken:${balance.asset}`,
          symbol: balance.symbol,
          name: balance.symbol,
          chainId: "kraken",
          amount: balance.amount,
          priceUsd: 1,
          valueUsd: balance.amount,
          assetClass: "cash",
        }];
      }

      const market = chooseUsdMarket(balance.symbol, markets);
      if (!market) return [];

      const priceUsd =
        priceByPair.get(market.pairKey) ?? priceByPair.get(market.displayPair);
      if (!priceUsd || priceUsd <= 0) return [];

      return [{
        sourceBalanceId: `kraken:${balance.asset}`,
        symbol: balance.symbol,
        name: balance.symbol,
        chainId: "kraken",
        amount: balance.amount,
        priceUsd,
        valueUsd: balance.amount * priceUsd,
        assetClass: "crypto",
      }];
    });

    return {
      status: "ready",
      address,
      balances: balances.sort((a, b) => b.valueUsd - a.valueUsd),
    };
  } catch (err) {
    const httpStatus =
      err instanceof Error && "httpStatus" in err
        ? Number(err.httpStatus)
        : 502;

    if (httpStatus === 429) {
      return { status: "rate_limited", address };
    }

    return {
      status: "error",
      address,
      message: err instanceof Error ? err.message : "Kraken API error",
      httpStatus: Number.isFinite(httpStatus) ? httpStatus : 502,
    };
  }
}

export async function fetchKrakenAssetPairs(): Promise<
  Record<string, KrakenAssetPair>
> {
  return krakenPublicGet<Record<string, KrakenAssetPair>>(
    KRAKEN_PUBLIC_ASSET_PAIRS_PATH,
    new URLSearchParams({ assetVersion: "1" }),
  );
}

/** Fetch every trade in the requested time range (Kraken returns 50 per page). */
export type KrakenTradesHistoryPage = {
  trades: Record<string, KrakenTrade>;
  count: number;
  offset: number;
};

export async function fetchKrakenTradesHistoryPage(
  credentials: KrakenCredentials,
  input: { startUnix?: number; endUnix: number; offset?: number },
): Promise<KrakenTradesHistoryPage> {
  const offset = input.offset ?? 0;
  const result = await krakenPrivatePost<KrakenTradesHistory>(
    KRAKEN_PRIVATE_TRADES_HISTORY_PATH,
    credentials,
    {
      type: "all",
      ...(input.startUnix ? { start: String(input.startUnix) } : {}),
      end: String(input.endUnix),
      ofs: String(offset),
    },
  );

  return { trades: result.trades, count: result.count ?? 0, offset };
}
