import "server-only";

import { getLighterToken, type SavedLighterAccount } from "@/lib/lighter/accounts";
import {
  fetchLighterMarkets,
  fetchLighterTrades,
  type LighterHistoryItem,
  type LighterMarket,
} from "@/lib/lighter/client";
import { and, eq, like } from "drizzle-orm";

import { db } from "@/db";
import { investmentTransactions } from "@/db/schema/investment-transactions";
import {
  getInvestmentTransactionSyncState,
  saveInvestmentTransactionPage,
  type InvestmentTransactionSide,
  type NormalizedInvestmentTransaction,
} from "@/lib/investment-transactions/ingestion";

type Checkpoint = {
  version: 3;
  phase: "backfilling" | "up_to_date";
  cursor: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function timestamp(row: LighterHistoryItem): Date {
  const raw = numeric(row.timestamp ?? row.time ?? row.created_at ?? row.executed_at);
  if (raw === null) return new Date();
  return new Date(raw < 10_000_000_000 ? raw * 1_000 : raw);
}
function transactionId(row: LighterHistoryItem, prefix: string): string {
  const id = row.trade_id ?? row.tx_hash ?? row.hash ?? row.id;
  return `${prefix}:${id === null || id === undefined ? JSON.stringify(row) : String(id)}`;
}
function tradeSide(row: LighterHistoryItem): InvestmentTransactionSide {
  const side = text(row.side ?? row.direction)?.toLowerCase() ?? "";
  if (side.includes("buy")) return "buy";
  if (side.includes("sell")) return "sell";
  if (side.includes("open")) return "open";
  if (side.includes("close")) return "close";
  return "unknown";
}
function tradeSideForAccount(
  row: LighterHistoryItem,
  accountIndex: number,
): InvestmentTransactionSide {
  if (numeric(row.ask_account_id) === accountIndex) return "sell";
  if (numeric(row.bid_account_id) === accountIndex) return "buy";
  return tradeSide(row);
}
function accountOrderId(row: LighterHistoryItem, accountIndex: number): string {
  const value = numeric(row.ask_account_id) === accountIndex
    ? row.ask_id_str ?? row.ask_id
    : row.bid_id_str ?? row.bid_id;
  return value === null || value === undefined
    ? transactionId(row, "fill")
    : String(value);
}

function normalizeTradeGroup(
  rows: LighterHistoryItem[],
  accountIndex: number,
  markets: Map<number, LighterMarket>,
): NormalizedInvestmentTransaction {
  const first = rows[0];
  if (!first) throw new Error("Cannot normalize an empty Lighter trade group.");
  const marketId = numeric(first.market_id) ?? -1;
  const market = markets.get(marketId);
  const amount = rows.reduce((sum, row) => sum + (numeric(row.size) ?? 0), 0);
  const quote = rows.reduce(
    (sum, row) => sum + (numeric(row.usd_amount) ?? ((numeric(row.size) ?? 0) * (numeric(row.price) ?? 0))),
    0,
  );
  const side = tradeSideForAccount(first, accountIndex);
  const orderId = accountOrderId(first, accountIndex);
  return {
    sourceProvider: "lighter",
    sourceTransactionId: `order:${marketId}:${side}:${orderId}`,
    sourceAccountId: String(accountIndex),
    executedAt: rows.map(timestamp).sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(),
    kind: "trade",
    side,
    baseAssetSymbol: market?.baseSymbol ?? `MARKET-${marketId}`,
    baseAssetId: String(marketId),
    baseAmount: amount,
    quoteAssetSymbol: market?.quoteSymbol ?? "USDC",
    quoteAssetId: market?.quoteSymbol ?? "USDC",
    quoteAmount: quote,
    priceQuote: amount > 0 ? quote / amount : null,
    valueUsd: quote,
    feeAmount: null,
    feeAssetSymbol: market?.quoteSymbol ?? "USDC",
    chainId: "lighter",
    txHash: text(first.tx_hash ?? first.hash),
    status: "confirmed",
    raw: {
      aggregateBy: "lighter_order",
      orderId,
      marketId,
      fillIds: rows.map((row) => String(row.trade_id ?? row.tx_hash ?? "")),
      fills: rows,
    },
  };
}

function aggregateTrades(
  rows: LighterHistoryItem[],
  accountIndex: number,
  markets: Map<number, LighterMarket>,
): NormalizedInvestmentTransaction[] {
  const groups = new Map<string, LighterHistoryItem[]>();
  for (const row of rows) {
    const key = `${numeric(row.market_id) ?? -1}:${tradeSideForAccount(row, accountIndex)}:${accountOrderId(row, accountIndex)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) =>
    normalizeTradeGroup(group, accountIndex, markets),
  );
}
function checkpoint(value: Record<string, unknown> | null): Checkpoint {
  if (value?.version === 3) {
    return value as Checkpoint;
  }
  // Earlier versions alternated between trades and region-blocked account
  // activity. Version 3 deliberately restarts as a trades-only sync.
  return { version: 3, phase: "backfilling", cursor: null };
}

export async function processLighterTransactionSyncPage(input: {
  userId: string;
  account: SavedLighterAccount;
}): Promise<{
  transactionCount: number;
  shouldContinue: boolean;
  phase: Checkpoint["phase"];
}> {
  const token = await getLighterToken(input.userId, input.account.id);
  if (!token) throw new Error("Lighter read-only token is missing.");
  const state = await getInvestmentTransactionSyncState({
    userId: input.userId,
    investmentAccountId: input.account.id,
    provider: "lighter",
  });
  const current = checkpoint(state?.checkpoint ?? null);
  const [page, markets] = await Promise.all([
    fetchLighterTrades({
      accountIndex: input.account.accountIndex,
      token,
      cursor: current.cursor ?? undefined,
    }),
    fetchLighterMarkets(),
  ]);
  if (page.cursor && page.cursor === current.cursor) {
    throw new Error("Lighter trades pagination cursor did not advance.");
  }
  if (current.cursor === null) {
    await db.delete(investmentTransactions).where(and(
      eq(investmentTransactions.userId, input.userId),
      eq(investmentTransactions.investmentAccountId, input.account.id),
      eq(investmentTransactions.sourceProvider, "lighter"),
      like(investmentTransactions.sourceTransactionId, "trade:{%"),
    ));
  }
  const transactions = aggregateTrades(
    page.items,
    input.account.accountIndex,
    markets,
  );
  const next: Checkpoint = page.cursor
    ? { version: 3, phase: "backfilling", cursor: page.cursor }
    : { version: 3, phase: "up_to_date", cursor: null };
  await saveInvestmentTransactionPage({
    transactions: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      transactions,
    },
    syncState: {
      userId: input.userId,
      investmentAccountId: input.account.id,
      provider: "lighter",
      status: next.phase === "up_to_date" ? "success" : "syncing",
      checkpoint: next,
      latestSyncedExecutedAt: transactions.reduce<Date | null>(
        (latest, item) => !latest || item.executedAt > latest ? item.executedAt : latest,
        null,
      ),
      lastSyncedAt: new Date(),
      lastHttpStatus: null,
      lastErrorMessage: null,
      backfillCompletedAt: next.phase === "up_to_date" ? new Date() : null,
    },
  });
  return {
    transactionCount: transactions.length,
    shouldContinue: page.cursor !== null,
    phase: next.phase,
  };
}
