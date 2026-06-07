import "server-only";
import type { Position, PositionsResult } from "@/lib/types";

const ZERION_BASE = "https://api.zerion.io/v1";
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CURRENCY_RE = /^[a-z]{3}$/i;
const CHAIN_IDS_RE = /^[a-zA-Z0-9_-]+(?:,[a-zA-Z0-9_-]+)*$/;

function authHeader() {
  const key = process.env.ZERION_API_KEY;
  if (!key) throw new Error("ZERION_API_KEY is not set");
  // Basic auth: base64 of "key:" (note the trailing colon).
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

// Per-second rate-limit state from the last Zerion response. Used to pace the
// next call so we never trip a 429 (which would still cost one of the daily
// quota). Waiting costs time, not requests. Callers must run requests
// sequentially for this to be meaningful.
let lastSecond: { remaining: number; reset: number } | null = null;
let zerionQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a Zerion URL, pausing first if the previous response said we've used up
 * this second's allowance. Never retries — a 429 is returned to the caller as-is
 * so we don't burn more of the daily quota.
 */
async function pacedFetch(url: string, headers: HeadersInit): Promise<Response> {
  if (lastSecond && lastSecond.remaining <= 0) {
    await sleep(Math.max(lastSecond.reset, 1) * 1000);
  }

  const res = await fetch(url, { headers, cache: "no-store" });

  const remaining = Number(res.headers.get("RateLimit-Org-Second-Remaining"));
  const reset = Number(res.headers.get("RateLimit-Org-Second-Reset"));
  if (!Number.isNaN(remaining)) {
    lastSecond = { remaining, reset: Number.isNaN(reset) ? 1 : reset };
  }

  return res;
}

function queuedPacedFetch(
  url: string,
  headers: HeadersInit,
): Promise<Response> {
  const request = zerionQueue.then(() => pacedFetch(url, headers));
  zerionQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

type RawPosition = {
  attributes: {
    quantity?: { float?: number };
    value?: number | null;
    price?: number | null;
    fungible_info?: { symbol?: string };
  };
  relationships?: {
    chain?: {
      data?: {
        id?: string;
      };
    };
  };
};

function toPosition(raw: RawPosition): Position {
  return {
    symbol: raw.attributes.fungible_info?.symbol ?? "?",
    chainId: raw.relationships?.chain?.data?.id ?? "unknown",
    amount: raw.attributes.quantity?.float ?? 0,
    priceUsd: raw.attributes.price ?? 0,
    valueUsd: raw.attributes.value ?? 0,
  };
}

function validateOptions(
  address: string,
  opts: { chains?: string; currency?: string; minValue?: number },
): PositionsResult | null {
  if (!EVM_ADDRESS_RE.test(address)) {
    return {
      status: "error",
      address,
      message: "Invalid wallet address",
      httpStatus: 400,
    };
  }

  if (opts.currency && !CURRENCY_RE.test(opts.currency)) {
    return {
      status: "error",
      address,
      message: "Invalid currency",
      httpStatus: 400,
    };
  }

  if (opts.chains && !CHAIN_IDS_RE.test(opts.chains)) {
    return {
      status: "error",
      address,
      message: "Invalid chain filter",
      httpStatus: 400,
    };
  }

  if (opts.minValue !== undefined && opts.minValue < 0) {
    return {
      status: "error",
      address,
      message: "Invalid minimum value",
      httpStatus: 400,
    };
  }

  return null;
}

/**
 * Fetch every multi-chain token position for a wallet, following pagination.
 * Never cached (`no-store`): a Zerion call happens only when this is invoked,
 * and always returns fresh data. Trigger it from a user action (button), not
 * during page render, so page loads cost zero Zerion calls.
 */
export async function getWalletPositions(
  address: string,
  opts: { chains?: string; currency?: string; minValue?: number } = {},
): Promise<PositionsResult> {
  const validationError = validateOptions(address, opts);
  if (validationError) return validationError;

  // Zerion has no server-side value filter, so we drop dust below this
  // threshold ourselves. Catches spam/dust that isn't flagged as is_trash.
  const minValue = opts.minValue ?? 1;
  const url = new URL(`${ZERION_BASE}/wallets/${address}/positions/`);
  url.searchParams.set("currency", opts.currency ?? "usd");
  url.searchParams.set("sort", "-value");
  url.searchParams.set("filter[trash]", "only_non_trash");
  // Include DeFi positions (staked, LP, lending) alongside wallet tokens.
  // Omitting this defaults to `only_simple`, which hides all DeFi positions.
  url.searchParams.set("filter[positions]", "no_filter");
  if (opts.chains) url.searchParams.set("filter[chain_ids]", opts.chains);

  const headers = { accept: "application/json", authorization: authHeader() };
  const raw: RawPosition[] = [];
  let next: string | null = url.toString();

  while (next) {
    const res: Response = await queuedPacedFetch(next, headers);

    // 202 = wallet not indexed yet; caller can retry shortly.
    if (res.status === 202) return { status: "indexing", address };
    // 429 = rate limited. Do NOT retry — that would spend more daily quota.
    if (res.status === 429) return { status: "rate_limited", address };
    if (!res.ok) {
      return {
        status: "error",
        address,
        message: `Zerion API error ${res.status}`,
        httpStatus: res.status,
      };
    }

    const body = (await res.json()) as { data: RawPosition[]; links?: { next?: string } };
    raw.push(...body.data);
    next = body.links?.next ?? null;
  }

  // Drop dust: keep only positions worth at least `minValue` USD. This also
  // removes unpriced spam, which Zerion reports with a value of 0.
  const positions = raw
    .map(toPosition)
    .filter((p) => p.valueUsd >= minValue);

  return { status: "ready", address, positions };
}
