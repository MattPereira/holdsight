import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { investmentAccounts } from "@/db/schema/investment-accounts";
import {
  hyperCorePerpEvents,
  hyperCoreTransactionDetails,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import type { SavedHyperCoreAccount } from "@/lib/hyper-core/accounts";
import {
  fetchHyperCoreFillsPage,
  getHyperCoreSpotMarketSymbols,
  type HyperCoreFill,
} from "@/lib/hyper-core/client";
import {
  getInvestmentTransactionSyncState,
  saveInvestmentTransactionPage,
  type InvestmentTransactionSide,
  type InvestmentTransactionSyncCheckpoint,
  summarizeSyncPhase,
  type NormalizedHyperCoreTransactionDetails,
  type NormalizedInvestmentTransaction,
  type TransactionSyncPhase,
} from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const HYPERLIQUID_PROVIDER = "hyperliquid";
const HYPERCORE_CHAIN_ID = "hypercore";
const HYPERCORE_FILLS_PAGE_LIMIT = 2_000;
const INCREMENTAL_SYNC_OVERLAP_MS = 24 * 60 * 60 * 1_000;

type HyperCoreFillsCheckpoint =
  | { version: 1; phase: "backfilling" | "forward_sync"; scan: { startTime: number; endTime: number } }
  | { version: 1; phase: "up_to_date"; scannedThroughTime: number };

export type HyperCoreTransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  hasMore: boolean;
  phase: TransactionSyncPhase;
};

export type HyperCoreTransactionSyncPageResult = {
  transactionCount: number;
  phase: HyperCoreFillsCheckpoint["phase"];
  shouldContinue: boolean;
};

export type CurrentHyperCoreTransaction = InvestmentTransactionListItem;

type AggregatedHyperCoreFill = {
  sourceTransactionId: string;
  coin: string;
  oid: number;
  time: number;
  side: HyperCoreFill["side"];
  dir: string;
  crossed: boolean;
  feeToken: string | null;
  hash: string | null;
  fillIds: string[];
  baseAmount: number;
  quoteAmount: number | null;
  priceQuote: number | null;
  feeAmount: number | null;
  fills: HyperCoreFill[];
};

type PerpPositionSide = "long" | "short";
type PerpEventType = "open" | "increase" | "decrease" | "close";

type PerpLot = {
  sourceTransactionId: string;
  remainingBaseAmount: number;
  remainingEntryNotionalUsd: number;
  remainingFeeUsd: number;
};

type DerivedPerpEvent = {
  sourceEventId: string;
  sourceTransactionIds: string[];
  executedAt: Date;
  market: string;
  positionSide: PerpPositionSide;
  eventType: PerpEventType;
  baseAssetSymbol: string;
  baseAmount: number;
  entryNotionalUsd: number | null;
  exitNotionalUsd: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  grossPnlUsd: number | null;
  feeUsd: number | null;
  netPnlUsd: number | null;
  raw: unknown;
};

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function isScan(value: unknown): value is { startTime: number; endTime: number } {
  if (!value || typeof value !== "object") return false;
  const scan = value as Partial<{ startTime: number; endTime: number }>;
  return Number.isFinite(scan.startTime) && Number.isFinite(scan.endTime);
}

function isHyperCoreFillsCheckpoint(
  value: InvestmentTransactionSyncCheckpoint | null,
): value is HyperCoreFillsCheckpoint {
  if (!value || value.version !== 1 || typeof value.phase !== "string") return false;
  if (value.phase === "backfilling" || value.phase === "forward_sync") {
    return isScan(value.scan);
  }
  return value.phase === "up_to_date" && typeof value.scannedThroughTime === "number";
}

function isHyperCoreTransactionSyncComplete(
  value: InvestmentTransactionSyncCheckpoint | null,
): boolean {
  return isHyperCoreFillsCheckpoint(value) && value.phase === "up_to_date";
}

function initialCheckpoint(now: number): HyperCoreFillsCheckpoint {
  return {
    version: 1,
    phase: "backfilling",
    scan: { startTime: 0, endTime: now },
  };
}

function sourceTransactionId(fill: HyperCoreFill): string {
  return `fill:${fill.tid}`;
}

function sourceOrderTransactionId(
  fill: Pick<HyperCoreFill, "coin" | "dir" | "oid" | "side">,
): string {
  return `order:${fill.oid}:${fill.coin}:${fill.side}:${fill.dir}`;
}

function sideForDirection(
  directionValue: string,
  sideValue: HyperCoreFill["side"],
): InvestmentTransactionSide {
  const direction = directionValue.toLowerCase();
  if (direction.startsWith("open")) return "open";
  if (direction.startsWith("close")) return "close";
  if (direction === "buy") return "buy";
  if (direction === "sell") return "sell";
  return sideValue === "B" ? "buy" : "sell";
}

function finiteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalValue(value: number | null): string | null {
  return value === null ? null : String(value);
}

function perpPositionSide(direction: string | null): PerpPositionSide | null {
  const normalized = direction?.toLowerCase() ?? "";
  if (normalized.includes("long")) return "long";
  if (normalized.includes("short")) return "short";
  return null;
}

function isOpeningPerp(direction: string | null): boolean {
  return direction?.toLowerCase().startsWith("open") ?? false;
}

function isClosingPerp(direction: string | null): boolean {
  return direction?.toLowerCase().startsWith("close") ?? false;
}

function oppositePositionSide(side: PerpPositionSide): PerpPositionSide {
  return side === "long" ? "short" : "long";
}

function assetSymbolsForFill(
  coin: string,
  spotMarketSymbols: Map<string, string>,
): { base: string; quote: string } {
  const spotPair = spotMarketSymbols.get(coin);
  if (!spotPair) return { base: coin, quote: "USDC" };

  const [base, quote] = spotPair.split("/");
  return { base: base || coin, quote: quote || "USDC" };
}

function aggregateFillGroup(fills: HyperCoreFill[]): AggregatedHyperCoreFill {
  const [first] = fills;
  if (!first) throw new Error("Cannot aggregate an empty HyperCore fill group.");

  const fillIds = fills.map((fill) => String(fill.tid));
  let baseAmount = 0;
  let quoteAmount = 0;
  let hasQuoteAmount = false;
  let feeAmount = 0;
  let hasFeeAmount = false;
  const feeTokens = new Set<string>();

  for (const fill of fills) {
    const amount = finiteNumber(fill.sz);
    if (amount !== null) baseAmount += amount;

    const price = finiteNumber(fill.px);
    if (amount !== null && price !== null) {
      quoteAmount += amount * price;
      hasQuoteAmount = true;
    }

    const fee = finiteNumber(fill.fee);
    if (fee !== null) {
      feeAmount += fee;
      hasFeeAmount = true;
    }
    if (fill.feeToken) feeTokens.add(fill.feeToken);
  }

  return {
    sourceTransactionId: sourceOrderTransactionId(first),
    coin: first.coin,
    oid: first.oid,
    time: Math.min(...fills.map((fill) => fill.time)),
    side: first.side,
    dir: first.dir,
    crossed: fills.some((fill) => fill.crossed),
    feeToken: feeTokens.size === 1 ? [...feeTokens][0] : null,
    hash: fills.find((fill) => fill.hash)?.hash ?? null,
    fillIds,
    baseAmount,
    quoteAmount: hasQuoteAmount ? quoteAmount : null,
    priceQuote: hasQuoteAmount && baseAmount > 0 ? quoteAmount / baseAmount : null,
    feeAmount: hasFeeAmount ? feeAmount : null,
    fills,
  };
}

function aggregateFillsByOrder(fills: HyperCoreFill[]): AggregatedHyperCoreFill[] {
  const groups = new Map<string, HyperCoreFill[]>();

  for (const fill of fills) {
    const key = `${fill.oid}:${fill.coin}:${fill.side}:${fill.dir}`;
    groups.set(key, [...(groups.get(key) ?? []), fill]);
  }

  return [...groups.values()]
    .map(aggregateFillGroup)
    .sort((a, b) => a.time - b.time);
}

async function deleteSupersededFillTransactions(input: {
  userId: string;
  investmentAccountId: string;
  sourceTransactionIds: string[];
}): Promise<void> {
  if (input.sourceTransactionIds.length === 0) return;

  await db
    .delete(investmentTransactions)
    .where(
      and(
        eq(investmentTransactions.userId, input.userId),
        eq(investmentTransactions.investmentAccountId, input.investmentAccountId),
        eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER),
        inArray(
          investmentTransactions.sourceTransactionId,
          input.sourceTransactionIds,
        ),
      ),
    );
}

export async function rebuildHyperCorePerpEvents(input: {
  userId: string;
  investmentAccountId: string;
}): Promise<void> {
  const sourceRows = await db
    .select({
      id: investmentTransactions.id,
      sourceTransactionId: investmentTransactions.sourceTransactionId,
      executedAt: investmentTransactions.executedAt,
      market: hyperCoreTransactionDetails.market,
      direction: hyperCoreTransactionDetails.direction,
      baseAssetSymbol: investmentTransactions.baseAssetSymbol,
      baseAmount: investmentTransactions.baseAmount,
      quoteAmount: investmentTransactions.quoteAmount,
      priceQuote: investmentTransactions.priceQuote,
      feeAmount: investmentTransactions.feeAmount,
      feeAssetSymbol: investmentTransactions.feeAssetSymbol,
      raw: investmentTransactions.raw,
    })
    .from(investmentTransactions)
    .innerJoin(
      hyperCoreTransactionDetails,
      eq(hyperCoreTransactionDetails.transactionId, investmentTransactions.id),
    )
    .where(
      and(
        eq(investmentTransactions.userId, input.userId),
        eq(investmentTransactions.investmentAccountId, input.investmentAccountId),
        eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER),
      ),
    )
    .orderBy(asc(investmentTransactions.executedAt));

  const lots = new Map<string, PerpLot[]>();
  const events: DerivedPerpEvent[] = [];

  for (const row of sourceRows) {
    const positionSide = perpPositionSide(row.direction);
    if (!positionSide) continue;

    const baseAmount = finiteNumber(row.baseAmount);
    if (baseAmount === null || baseAmount <= 0) continue;

    const baseAssetSymbol = row.baseAssetSymbol ?? row.market;
    const quoteAmount = finiteNumber(row.quoteAmount);
    const feeUsd = row.feeAssetSymbol === "USDC" ? finiteNumber(row.feeAmount) : null;
    const priceQuote = finiteNumber(row.priceQuote);

    if (isOpeningPerp(row.direction)) {
      const key = `${row.market}:${positionSide}`;
      const existingLots = lots.get(key) ?? [];
      const eventType: PerpEventType = existingLots.length > 0 ? "increase" : "open";
      const entryNotionalUsd = quoteAmount;

      existingLots.push({
        sourceTransactionId: row.sourceTransactionId,
        remainingBaseAmount: baseAmount,
        remainingEntryNotionalUsd: entryNotionalUsd ?? 0,
        remainingFeeUsd: feeUsd ?? 0,
      });
      lots.set(key, existingLots);

      events.push({
        sourceEventId: `perp:${row.sourceTransactionId}`,
        sourceTransactionIds: [row.sourceTransactionId],
        executedAt: row.executedAt,
        market: row.market,
        positionSide,
        eventType,
        baseAssetSymbol,
        baseAmount,
        entryNotionalUsd,
        exitNotionalUsd: null,
        entryPrice: priceQuote,
        exitPrice: null,
        grossPnlUsd: null,
        feeUsd,
        netPnlUsd: null,
        raw: { source: row.raw },
      });
      continue;
    }

    if (!isClosingPerp(row.direction)) continue;

    const key = `${row.market}:${positionSide}`;
    const openLots = lots.get(key) ?? [];
    let remainingCloseAmount = baseAmount;
    let matchedBaseAmount = 0;
    let matchedEntryNotionalUsd = 0;
    let matchedEntryFeeUsd = 0;
    const matchedSourceTransactionIds: string[] = [];

    while (remainingCloseAmount > 0 && openLots.length > 0) {
      const lot = openLots[0];
      const matchedAmount = Math.min(remainingCloseAmount, lot.remainingBaseAmount);
      const matchRatio = matchedAmount / lot.remainingBaseAmount;

      matchedBaseAmount += matchedAmount;
      matchedEntryNotionalUsd += lot.remainingEntryNotionalUsd * matchRatio;
      matchedEntryFeeUsd += lot.remainingFeeUsd * matchRatio;
      matchedSourceTransactionIds.push(lot.sourceTransactionId);

      lot.remainingBaseAmount -= matchedAmount;
      lot.remainingEntryNotionalUsd -= lot.remainingEntryNotionalUsd * matchRatio;
      lot.remainingFeeUsd -= lot.remainingFeeUsd * matchRatio;
      remainingCloseAmount -= matchedAmount;

      if (lot.remainingBaseAmount <= 1e-12) openLots.shift();
    }

    lots.set(key, openLots);

    const exitNotionalUsd = quoteAmount === null
      ? null
      : quoteAmount * (matchedBaseAmount > 0 ? matchedBaseAmount / baseAmount : 1);
    const closeFeeUsd = feeUsd === null
      ? null
      : feeUsd * (matchedBaseAmount > 0 ? matchedBaseAmount / baseAmount : 1);
    const grossPnlUsd = exitNotionalUsd === null || matchedBaseAmount === 0
      ? null
      : positionSide === "long"
        ? exitNotionalUsd - matchedEntryNotionalUsd
        : matchedEntryNotionalUsd - exitNotionalUsd;
    const totalFeeUsd = closeFeeUsd === null
      ? matchedEntryFeeUsd || null
      : matchedEntryFeeUsd + closeFeeUsd;
    const netPnlUsd = grossPnlUsd === null
      ? null
      : grossPnlUsd - (totalFeeUsd ?? 0);
    const remainingPositionAmount = openLots.reduce(
      (sum, lot) => sum + lot.remainingBaseAmount,
      0,
    );

    events.push({
      sourceEventId: `perp:${row.sourceTransactionId}`,
      sourceTransactionIds: [
        ...new Set([...matchedSourceTransactionIds, row.sourceTransactionId]),
      ],
      executedAt: row.executedAt,
      market: row.market,
      positionSide,
      eventType: remainingPositionAmount > 0 ? "decrease" : "close",
      baseAssetSymbol,
      baseAmount: matchedBaseAmount || baseAmount,
      entryNotionalUsd: matchedBaseAmount > 0 ? matchedEntryNotionalUsd : null,
      exitNotionalUsd,
      entryPrice: matchedBaseAmount > 0 ? matchedEntryNotionalUsd / matchedBaseAmount : null,
      exitPrice: priceQuote,
      grossPnlUsd,
      feeUsd: totalFeeUsd,
      netPnlUsd,
      raw: { source: row.raw, matchedSourceTransactionIds },
    });

    if (remainingCloseAmount > 1e-12) {
      const flippedSide = oppositePositionSide(positionSide);
      const flippedKey = `${row.market}:${flippedSide}`;
      const flippedLots = lots.get(flippedKey) ?? [];
      const remainingRatio = remainingCloseAmount / baseAmount;
      flippedLots.push({
        sourceTransactionId: row.sourceTransactionId,
        remainingBaseAmount: remainingCloseAmount,
        remainingEntryNotionalUsd: (quoteAmount ?? 0) * remainingRatio,
        remainingFeeUsd: (feeUsd ?? 0) * remainingRatio,
      });
      lots.set(flippedKey, flippedLots);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(hyperCorePerpEvents)
      .where(
        and(
          eq(hyperCorePerpEvents.userId, input.userId),
          eq(hyperCorePerpEvents.investmentAccountId, input.investmentAccountId),
        ),
      );

    if (events.length === 0) return;

    await tx.insert(hyperCorePerpEvents).values(
      events.map((event) => ({
        userId: input.userId,
        investmentAccountId: input.investmentAccountId,
        sourceEventId: event.sourceEventId,
        sourceTransactionIds: event.sourceTransactionIds,
        executedAt: event.executedAt,
        market: event.market,
        positionSide: event.positionSide,
        eventType: event.eventType,
        baseAssetSymbol: event.baseAssetSymbol,
        baseAmount: String(event.baseAmount),
        entryNotionalUsd: decimalValue(event.entryNotionalUsd),
        exitNotionalUsd: decimalValue(event.exitNotionalUsd),
        entryPrice: decimalValue(event.entryPrice),
        exitPrice: decimalValue(event.exitPrice),
        grossPnlUsd: decimalValue(event.grossPnlUsd),
        feeUsd: decimalValue(event.feeUsd),
        netPnlUsd: decimalValue(event.netPnlUsd),
        raw: event.raw,
      })),
    );
  });
}

function normalizeAggregatedFill(
  fill: AggregatedHyperCoreFill,
  spotMarketSymbols: Map<string, string>,
): NormalizedInvestmentTransaction {
  const assets = assetSymbolsForFill(fill.coin, spotMarketSymbols);

  return {
    sourceProvider: HYPERLIQUID_PROVIDER,
    sourceTransactionId: fill.sourceTransactionId,
    sourceAccountId: null,
    executedAt: new Date(fill.time),
    kind: "trade",
    side: sideForDirection(fill.dir, fill.side),
    baseAssetSymbol: assets.base,
    baseAssetId: assets.base,
    baseAmount: fill.baseAmount,
    quoteAssetSymbol: assets.quote,
    quoteAssetId: assets.quote,
    quoteAmount: fill.quoteAmount,
    priceQuote: fill.priceQuote,
    valueUsd: assets.quote === "USDC" ? fill.quoteAmount : null,
    feeAmount: fill.feeAmount,
    feeAssetSymbol: fill.feeToken,
    chainId: HYPERCORE_CHAIN_ID,
    txHash: fill.hash,
    status: "confirmed",
    raw: {
      aggregateBy: "hyperliquid_order",
      fillIds: fill.fillIds,
      fills: fill.fills,
    },
  };
}

function normalizeFillDetails(fill: AggregatedHyperCoreFill): NormalizedHyperCoreTransactionDetails {
  return {
    sourceTransactionId: fill.sourceTransactionId,
    market: fill.coin,
    orderId: String(fill.oid),
    fillId: fill.fillIds.join(","),
    direction: fill.dir,
    crossed: fill.crossed,
    feeToken: fill.feeToken,
  };
}

function earliestFillDate(fills: HyperCoreFill[]): Date | null {
  if (fills.length === 0) return null;
  return new Date(Math.min(...fills.map((fill) => fill.time)));
}

/** Advances one durable, time-paginated HyperCore fills page. */
export async function processHyperCoreTransactionSyncPage(input: {
  userId: string;
  account: SavedHyperCoreAccount;
}): Promise<HyperCoreTransactionSyncPageResult> {
  const state = await getInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.account.id,
    provider: HYPERLIQUID_PROVIDER,
  });
  const now = Date.now();
  const storedCheckpoint = state?.checkpoint ?? null;
  const checkpoint = isHyperCoreFillsCheckpoint(storedCheckpoint)
    ? storedCheckpoint
    : initialCheckpoint(now);
  const scan = checkpoint.phase === "up_to_date"
    ? {
        startTime: Math.max(0, checkpoint.scannedThroughTime - INCREMENTAL_SYNC_OVERLAP_MS),
        endTime: now,
      }
    : checkpoint.scan;
  const [fills, spotMarketSymbols] = await Promise.all([
    fetchHyperCoreFillsPage({ address: input.account.address, ...scan }),
    getHyperCoreSpotMarketSymbols(),
  ]);
  const latestFillTime = fills.reduce(
    (latest, fill) => Math.max(latest, fill.time),
    scan.startTime,
  );
  const hasMore = fills.length >= HYPERCORE_FILLS_PAGE_LIMIT;
  if (hasMore && latestFillTime <= scan.startTime) {
    throw new Error("HyperCore fills page did not advance the time cursor.");
  }

  const nextCheckpoint: HyperCoreFillsCheckpoint = hasMore
    ? {
        version: 1,
        phase: checkpoint.phase === "up_to_date" ? "forward_sync" : checkpoint.phase,
        scan: { startTime: latestFillTime, endTime: scan.endTime },
      }
    : { version: 1, phase: "up_to_date", scannedThroughTime: scan.endTime };
  const syncCompleted = nextCheckpoint.phase === "up_to_date";
  const nowDate = new Date();
  const aggregatedFills = aggregateFillsByOrder(fills);
  const saved = await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions: aggregatedFills.map((fill) => normalizeAggregatedFill(fill, spotMarketSymbols)),
      hyperCoreDetails: aggregatedFills.map(normalizeFillDetails),
    },
    syncState: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      provider: HYPERLIQUID_PROVIDER,
      status: syncCompleted ? "success" : "syncing",
      checkpoint: nextCheckpoint,
      earliestBackfilledAt: earliestFillDate(fills) ?? state?.earliestBackfilledAt ?? null,
      latestSyncedExecutedAt: syncCompleted ? new Date(scan.endTime) : state?.latestSyncedExecutedAt ?? null,
      backfillStartedAt: state?.backfillStartedAt ?? nowDate,
      backfillCompletedAt: syncCompleted ? nowDate : state?.backfillCompletedAt ?? null,
      lastSyncedAt: nowDate,
      lastHttpStatus: null,
      lastErrorMessage: null,
    },
  });
  await deleteSupersededFillTransactions({
    userId: input.userId,
    investmentAccountId: input.account.id,
    sourceTransactionIds: fills.map(sourceTransactionId),
  });
  await rebuildHyperCorePerpEvents({
    userId: input.userId,
    investmentAccountId: input.account.id,
  });

  return {
    transactionCount: saved.transactions.transactionCount,
    phase: nextCheckpoint.phase,
    shouldContinue: !syncCompleted,
  };
}

export async function getCurrentHyperCoreTransactions(
  userId: string,
): Promise<CurrentHyperCoreTransaction[]> {
  const rows = await db
    .select({
      id: investmentTransactions.id,
      investmentAccountId: investmentTransactions.investmentAccountId,
      accountLabel: investmentAccounts.label,
      sourceTransactionId: investmentTransactions.sourceTransactionId,
      sourceAccountId: investmentTransactions.sourceAccountId,
      executedAt: investmentTransactions.executedAt,
      settledAt: investmentTransactions.settledAt,
      kind: investmentTransactions.kind,
      side: investmentTransactions.side,
      baseAssetSymbol: investmentTransactions.baseAssetSymbol,
      baseAssetId: investmentTransactions.baseAssetId,
      baseAmount: investmentTransactions.baseAmount,
      quoteAssetSymbol: investmentTransactions.quoteAssetSymbol,
      quoteAmount: investmentTransactions.quoteAmount,
      priceQuote: investmentTransactions.priceQuote,
      valueUsd: investmentTransactions.valueUsd,
      feeAmount: investmentTransactions.feeAmount,
      feeAssetSymbol: investmentTransactions.feeAssetSymbol,
      status: investmentTransactions.status,
    })
    .from(investmentTransactions)
    .innerJoin(
      investmentAccounts,
      eq(investmentAccounts.id, investmentTransactions.investmentAccountId),
    )
    .where(
      and(
        eq(investmentTransactions.userId, userId),
        eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER),
      ),
    )
    .orderBy(desc(investmentTransactions.executedAt));

  return rows.map((row) => ({
    ...row,
    executedAt: row.executedAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
    baseAmount: numberOrNull(row.baseAmount),
    quoteAmount: numberOrNull(row.quoteAmount),
    priceQuote: numberOrNull(row.priceQuote),
    valueUsd: numberOrNull(row.valueUsd),
    feeAmount: numberOrNull(row.feeAmount),
  }));
}

export async function getHyperCoreTransactionHistoryStatus(
  userId: string,
  accounts: SavedHyperCoreAccount[],
): Promise<HyperCoreTransactionHistoryStatus> {
  if (accounts.length === 0) {
    return { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false, phase: "up_to_date" };
  }

  const [earliest, latest, states] = await Promise.all([
    db.select({ executedAt: investmentTransactions.executedAt })
      .from(investmentTransactions)
      .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER)))
      .orderBy(asc(investmentTransactions.executedAt)).limit(1),
    db.select({ executedAt: investmentTransactions.executedAt })
      .from(investmentTransactions)
      .where(and(eq(investmentTransactions.userId, userId), eq(investmentTransactions.sourceProvider, HYPERLIQUID_PROVIDER)))
      .orderBy(desc(investmentTransactions.executedAt)).limit(1),
    Promise.all(accounts.map((account) => getInvestmentTransactionSyncState({
      userId,
      investmentAccountId: account.id,
      provider: HYPERLIQUID_PROVIDER,
    }))),
  ]);

  return {
    earliestTransactionAt: earliest[0]?.executedAt.toISOString() ?? null,
    latestTransactionAt: latest[0]?.executedAt.toISOString() ?? null,
    hasMore: states.some((state) => !isHyperCoreTransactionSyncComplete(state?.checkpoint ?? null)),
    phase: summarizeSyncPhase(states),
  };
}
