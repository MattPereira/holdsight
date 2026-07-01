import "server-only";

import type { InvestmentBalance } from "@/lib/portfolio/types";

const LIGHTER_API_URL =
  process.env.LIGHTER_API_URL ?? "https://mainnet.zklighter.elliot.ai";

type JsonRecord = Record<string, unknown>;

export type LighterAccountSnapshot = {
  index: number;
  l1Address: string;
  balances: InvestmentBalance[];
};

export type LighterHistoryItem = JsonRecord;
export type LighterMarket = {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function getJson(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  token?: string,
): Promise<unknown> {
  const url = new URL(path, LIGHTER_API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(token ? { authorization: token } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const error = new Error(`Lighter API error ${response.status}`);
    Object.assign(error, { httpStatus: response.status });
    throw error;
  }
  return response.json();
}

function findAccount(payload: unknown, accountIndex: number): JsonRecord {
  const root = record(payload);
  const candidates = [
    ...arrayValue(root?.sub_accounts),
    ...arrayValue(root?.accounts),
    ...arrayValue(root?.data),
    payload,
  ];
  const account = candidates
    .map(record)
    .find((candidate) =>
      candidate &&
      numberValue(candidate.index ?? candidate.account_index) === accountIndex
    );
  if (!account) throw new Error("Lighter account was not found.");
  return account;
}

function normalizeBalances(
  account: JsonRecord,
  accountIndex: number,
  pricesByAssetId: Map<number, number>,
): InvestmentBalance[] {
  const rows = [
    ...arrayValue(account.assets),
    ...arrayValue(account.account_assets),
    ...arrayValue(account.balances),
  ].map(record).filter((value): value is JsonRecord => Boolean(value));

  const balances = rows.flatMap<InvestmentBalance>((asset, position) => {
    const amount = numberValue(
      asset.balance ?? asset.amount ?? asset.size ?? asset.total,
    );
    if (amount === null || amount === 0) return [];
    const symbol = stringValue(asset.symbol ?? asset.asset ?? asset.name) ??
      `ASSET-${numberValue(asset.asset_id ?? asset.asset_index) ?? position}`;
    const assetId = numberValue(asset.asset_id ?? asset.asset_index) ?? position;
    const price = numberValue(asset.price ?? asset.mark_price ?? asset.usd_price) ??
      (symbol.toUpperCase().includes("USD") ? 1 : pricesByAssetId.get(assetId) ?? null);
    if (price === null) return [];
    return [{
      sourceBalanceId: `lighter:${accountIndex}:asset:${assetId}`,
      symbol,
      name: stringValue(asset.name) ?? symbol,
      chainId: "lighter",
      amount,
      priceUsd: price,
      valueUsd: amount * price,
    }];
  });

  if (balances.length > 0) return balances;

  const accountValue = numberValue(
    account.total_asset_value ?? account.cross_asset_value ?? account.collateral,
  );
  if (accountValue === null || accountValue === 0) return [];
  return [{
    sourceBalanceId: `lighter:${accountIndex}:account-value`,
    symbol: "USDC",
    name: "Lighter Account Value",
    chainId: "lighter",
    amount: accountValue,
    priceUsd: 1,
    valueUsd: accountValue,
  }];
}

async function fetchLighterAssetPrices(): Promise<Map<number, number>> {
  const payload = await getJson("/api/v1/orderBookDetails", { filter: "spot" });
  const root = record(payload);
  const prices = new Map<number, number>();
  for (const value of arrayValue(root?.spot_order_book_details)) {
    const market = record(value);
    if (!market) continue;
    const baseAssetId = numberValue(market.base_asset_id);
    const quoteAssetId = numberValue(market.quote_asset_id);
    const price = numberValue(market.last_trade_price);
    if (quoteAssetId !== null) prices.set(quoteAssetId, 1);
    if (baseAssetId !== null && price !== null && price > 0) {
      prices.set(baseAssetId, price);
    }
  }
  return prices;
}

export async function fetchLighterMarkets(): Promise<Map<number, LighterMarket>> {
  const payload = await getJson("/api/v1/orderBookDetails", { filter: "all" });
  const root = record(payload);
  const markets = new Map<number, LighterMarket>();
  const values = [
    ...arrayValue(root?.order_book_details),
    ...arrayValue(root?.spot_order_book_details),
  ];
  for (const value of values) {
    const market = record(value);
    if (!market) continue;
    const marketId = numberValue(market.market_id);
    const symbol = stringValue(market.symbol);
    if (marketId === null || !symbol) continue;
    const [base, quote] = symbol.split("/");
    markets.set(marketId, {
      symbol,
      baseSymbol: base || symbol,
      quoteSymbol: quote || "USDC",
    });
  }
  return markets;
}

export async function fetchLighterAccount(
  accountIndex: number,
  token: string,
): Promise<LighterAccountSnapshot> {
  const [payload, pricesByAssetId] = await Promise.all([
    getJson(
      "/api/v1/account",
      { by: "index", value: accountIndex },
      token,
    ),
    fetchLighterAssetPrices(),
  ]);
  const account = findAccount(payload, accountIndex);
  const l1Address = stringValue(
    account.l1_address ?? account.l1Address ?? account.address,
  );
  if (!l1Address) throw new Error("Lighter account did not return an L1 address.");
  return {
    index: accountIndex,
    l1Address: l1Address.toLowerCase(),
    balances: normalizeBalances(account, accountIndex, pricesByAssetId),
  };
}

function historyRows(payload: unknown, keys: string[]): LighterHistoryItem[] {
  const root = record(payload);
  for (const key of keys) {
    const rows = arrayValue(root?.[key]).map(record).filter(Boolean);
    if (rows.length > 0) return rows as LighterHistoryItem[];
  }
  return arrayValue(payload).map(record).filter(Boolean) as LighterHistoryItem[];
}

export async function fetchLighterTrades(input: {
  accountIndex: number;
  token: string;
  cursor?: string;
}): Promise<{
  items: LighterHistoryItem[];
  cursor: string | null;
}> {
  const payload = await getJson("/api/v1/trades", {
    account_index: input.accountIndex,
    sort_by: "timestamp",
    sort_dir: "desc",
    limit: 100,
    aggregate: true,
    cursor: input.cursor,
  }, input.token);
  const root = record(payload);
  return {
    items: historyRows(payload, ["trades", "data"]),
    cursor: stringValue(root?.next_cursor ?? root?.cursor),
  };
}
