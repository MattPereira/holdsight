import "server-only";

import { isValidEvmAddress } from "@/lib/evm/accounts";
import type { InvestmentBalance } from "@/lib/portfolio/types";

const HYPERLIQUID_INFO_URL =
  process.env.HYPERLIQUID_INFO_URL ?? "https://api.hyperliquid.xyz/info";

type HyperliquidSpotState = {
  balances?: Array<{
    coin: string;
    token: number;
    hold: string;
    total: string;
    entryNtl: string;
  }>;
};

type HyperliquidDelegatorSummary = {
  delegated?: string;
  undelegated?: string;
  totalPendingWithdrawal?: string;
  nPendingWithdrawals?: number;
};

type HyperliquidSpotMeta = {
  tokens?: Array<{
    index?: number;
    tokenId?: string;
    name?: string;
    szDecimals?: number;
    weiDecimals?: number;
  }>;
  universe?: Array<{
    index?: number;
    name?: string;
    tokens?: [number, number];
  }>;
};

type HyperliquidSpotAssetCtx = {
  markPx?: string;
  midPx?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
};

type HyperliquidSpotMarketData = {
  meta: HyperliquidSpotMeta;
  assetCtxs: HyperliquidSpotAssetCtx[];
};

export type HyperCoreBalance = InvestmentBalance & {
  assetClass: "token" | "cash";
  balanceType: "spot" | "staking";
};

export type HyperCoreBalancesResult =
  | {
      status: "ready";
      address: string;
      balances: HyperCoreBalance[];
    }
  | { status: "rate_limited"; address: string }
  | { status: "error"; address: string; message: string; httpStatus: number };

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function postInfo(body: Record<string, unknown>): Promise<Response> {
  return fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

async function readInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await postInfo(body);

  if (res.status === 429) {
    throw Object.assign(new Error("Hyperliquid API rate limited"), {
      httpStatus: 429,
    });
  }

  if (!res.ok) {
    throw Object.assign(new Error(`Hyperliquid API error ${res.status}`), {
      httpStatus: res.status,
    });
  }

  return (await res.json()) as T;
}

async function fetchSpotState(address: string): Promise<HyperliquidSpotState> {
  return readInfo<HyperliquidSpotState>({
    type: "spotClearinghouseState",
    user: address,
  });
}

async function fetchDelegatorSummary(
  address: string,
): Promise<HyperliquidDelegatorSummary> {
  return readInfo<HyperliquidDelegatorSummary>({
    type: "delegatorSummary",
    user: address,
  });
}

async function fetchSpotMarketData(): Promise<HyperliquidSpotMarketData> {
  const [meta, assetCtxs] = await readInfo<
    [HyperliquidSpotMeta, HyperliquidSpotAssetCtx[]]
  >({
    type: "spotMetaAndAssetCtxs",
  });

  return { meta, assetCtxs };
}

function tokenName(meta: HyperliquidSpotMeta, tokenIndex: number): string | null {
  const token = meta.tokens?.find(
    (item, index) => item.index === tokenIndex || index === tokenIndex,
  );

  return token?.name ?? null;
}

function usdcTokenIndex(meta: HyperliquidSpotMeta): number {
  const usdc = meta.tokens?.find((token) => token.name === "USDC");
  return usdc?.index ?? 0;
}

function spotUsdPrice(
  tokenIndex: number,
  meta: HyperliquidSpotMeta,
  assetCtxs: HyperliquidSpotAssetCtx[],
): number | null {
  if (tokenIndex === usdcTokenIndex(meta)) return 1;

  const quoteTokenIndex = usdcTokenIndex(meta);
  const pairIndex = meta.universe?.findIndex(
    (item) =>
      item.tokens?.[0] === tokenIndex && item.tokens?.[1] === quoteTokenIndex,
  );

  if (pairIndex === undefined || pairIndex < 0) return null;

  const pair = meta.universe?.[pairIndex];
  const ctx = assetCtxs[pair?.index ?? pairIndex];
  const price = toNumber(ctx?.markPx ?? ctx?.midPx);

  return price > 0 ? price : null;
}

function tokenUsdPrice(
  tokenNameValue: string,
  meta: HyperliquidSpotMeta,
  assetCtxs: HyperliquidSpotAssetCtx[],
): number | null {
  const tokenIndex = meta.tokens?.findIndex(
    (token) => token.name === tokenNameValue,
  );

  if (tokenIndex === undefined || tokenIndex < 0) return null;

  const token = meta.tokens?.[tokenIndex];
  return spotUsdPrice(token?.index ?? tokenIndex, meta, assetCtxs);
}

function normalizeSpotBalances(
  spotState: HyperliquidSpotState,
  marketData: HyperliquidSpotMarketData,
): HyperCoreBalance[] {
  const balances: HyperCoreBalance[] = [];

  for (const balance of spotState.balances ?? []) {
    const amount = toNumber(balance.total);
    const hold = toNumber(balance.hold);
    if (amount === 0 && hold === 0) continue;

    const priceUsd = spotUsdPrice(
      balance.token,
      marketData.meta,
      marketData.assetCtxs,
    );
    if (priceUsd === null) continue;

    const symbol = balance.coin || tokenName(marketData.meta, balance.token) || "?";
    balances.push({
      sourceBalanceId: `hypercore:spot:${balance.token}`,
      symbol,
      name: tokenName(marketData.meta, balance.token) ?? symbol,
      chainId: "hypercore",
      amount,
      priceUsd,
      valueUsd: amount * priceUsd,
      assetClass: symbol === "USDC" ? "cash" : "token",
      balanceType: "spot",
    });
  }

  return balances;
}

function normalizeStakingBalances(
  stakingSummary: HyperliquidDelegatorSummary,
  marketData: HyperliquidSpotMarketData,
): HyperCoreBalance[] {
  const priceUsd = tokenUsdPrice(
    "HYPE",
    marketData.meta,
    marketData.assetCtxs,
  );
  if (priceUsd === null) return [];

  const buckets = [
    {
      sourceBalanceId: "hypercore:staking:hype:delegated",
      symbol: "sHYPE",
      name: "HYPE Staked",
      amount: toNumber(stakingSummary.delegated),
    },
    {
      sourceBalanceId: "hypercore:staking:hype:undelegated",
      symbol: "HYPE",
      name: "HYPE",
      amount: toNumber(stakingSummary.undelegated),
    },
    {
      sourceBalanceId: "hypercore:staking:hype:pending-withdrawal",
      symbol: "pHYPE",
      name: "HYPE Pending Unstake",
      amount: toNumber(stakingSummary.totalPendingWithdrawal),
    },
  ];

  return buckets.flatMap((bucket) => {
    if (bucket.amount === 0) return [];

    return [{
      sourceBalanceId: bucket.sourceBalanceId,
      symbol: bucket.symbol,
      name: bucket.name,
      chainId: "hypercore",
      amount: bucket.amount,
      priceUsd,
      valueUsd: bucket.amount * priceUsd,
      assetClass: "token" as const,
      balanceType: "staking" as const,
    }];
  });
}

export async function fetchHyperCoreBalances(
  address: string,
  spotMarketData?: HyperliquidSpotMarketData,
): Promise<HyperCoreBalancesResult> {
  if (!isValidEvmAddress(address)) {
    return {
      status: "error",
      address,
      message: "Invalid wallet address",
      httpStatus: 400,
    };
  }

  try {
    const [spotState, stakingSummary, resolvedSpotMarketData] =
      await Promise.all([
        fetchSpotState(address),
        fetchDelegatorSummary(address),
        spotMarketData
          ? Promise.resolve(spotMarketData)
          : fetchSpotMarketData(),
      ]);

    return {
      status: "ready",
      address,
      balances: [
        ...normalizeSpotBalances(spotState, resolvedSpotMarketData),
        ...normalizeStakingBalances(stakingSummary, resolvedSpotMarketData),
      ],
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
      message: err instanceof Error ? err.message : "Hyperliquid API error",
      httpStatus: Number.isFinite(httpStatus) ? httpStatus : 502,
    };
  }
}

export async function getHyperCoreSpotMarketData(): Promise<HyperliquidSpotMarketData> {
  return fetchSpotMarketData();
}
