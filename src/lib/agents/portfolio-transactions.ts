import "server-only";

import type {
  InvestmentTransactionKind,
  InvestmentTransactionSide,
} from "@/lib/investment-transactions/ingestion";
import {
  getUserInvestmentTransactionJournalImagesForTransactions,
  type InvestmentTransactionJournalImage,
} from "@/lib/investment-transactions/journal-images";
import {
  getUserInvestmentTransactionJournalEntries,
  type TradeJournalEntryRow,
} from "@/lib/investment-transactions/journal";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type { AssetGroup } from "@/lib/portfolio/asset-totals";
import { getUserAssetGroups } from "@/lib/portfolio/groups";
import { getCurrentPortfolioTransactions } from "@/lib/portfolio/transactions";

const DEFAULT_LIMIT = 100;
export const MAX_AGENT_TRANSACTION_LIMIT = 100;

export type AgentPortfolioTransactionFilters = {
  symbols?: string[];
  groupIds?: string[];
  startAt?: string;
  endAt?: string;
  kinds?: InvestmentTransactionKind[];
  sides?: InvestmentTransactionSide[];
  accountIds?: string[];
  minValueUsd?: number;
  maxValueUsd?: number;
  hasJournal?: boolean;
  limit?: number;
  cursor?: string;
};

type TransactionCursor = {
  executedAt: string;
  id: string;
};

export class AgentTransactionInputError extends Error {}

function uniqueNormalizedSymbols(symbols: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (symbols ?? [])
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function uniqueValues<T>(values: T[] | undefined): T[] {
  return Array.from(new Set(values ?? []));
}

function normalizedTimestamp(value: string | undefined, field: string) {
  if (value === undefined) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new AgentTransactionInputError(`${field} must be a valid timestamp.`);
  }
  return timestamp.toISOString();
}

function compareTransactionOrder(
  left: TransactionCursor,
  right: TransactionCursor,
): number {
  return (
    right.executedAt.localeCompare(left.executedAt) ||
    right.id.localeCompare(left.id)
  );
}

function encodeCursor(transaction: TransactionCursor): string {
  return Buffer.from(JSON.stringify(transaction)).toString("base64url");
}

function decodeCursor(cursor: string): TransactionCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("executedAt" in decoded) ||
      !("id" in decoded) ||
      typeof decoded.executedAt !== "string" ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0 ||
      Number.isNaN(new Date(decoded.executedAt).getTime())
    ) {
      throw new Error("Invalid cursor payload");
    }

    return {
      executedAt: new Date(decoded.executedAt).toISOString(),
      id: decoded.id,
    };
  } catch {
    throw new AgentTransactionInputError("cursor is invalid or malformed.");
  }
}

function groupBySymbol(groups: AssetGroup[]): Map<string, AssetGroup> {
  const result = new Map<string, AssetGroup>();
  for (const group of groups) {
    for (const symbol of group.symbols) {
      result.set(symbol.trim().toUpperCase(), group);
    }
  }
  return result;
}

function imagesByTransaction(
  images: InvestmentTransactionJournalImage[],
): Map<string, InvestmentTransactionJournalImage[]> {
  const result = new Map<string, InvestmentTransactionJournalImage[]>();
  for (const image of images) {
    const transactionImages = result.get(image.transactionId) ?? [];
    transactionImages.push(image);
    result.set(image.transactionId, transactionImages);
  }
  return result;
}

function serializeJournal(
  entry: TradeJournalEntryRow | undefined,
  images: InvestmentTransactionJournalImage[],
) {
  if (!entry) return null;

  return {
    id: entry.id,
    note: entry.note,
    tradeReason: entry.tradeReason,
    emotions: entry.emotions,
    marketBias: entry.marketBias,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    images: images.map((image) => ({
      id: image.id,
      url: image.blobUrl,
      originalFilename: image.originalFilename,
      contentType: image.contentType,
      sizeBytes: image.sizeBytes,
      sortOrder: image.sortOrder,
      createdAt: image.createdAt.toISOString(),
      updatedAt: image.updatedAt.toISOString(),
    })),
  };
}

function withoutJournalSummary(transaction: InvestmentTransactionListItem) {
  const { journalSummary, ...fields } = transaction;
  void journalSummary;
  return fields;
}

export async function getPortfolioTransactionsForAgent(
  userId: string,
  input: AgentPortfolioTransactionFilters = {},
) {
  const [snapshot, groups] = await Promise.all([
    getCurrentPortfolioTransactions(userId),
    getUserAssetGroups(userId),
  ]);

  const symbols = uniqueNormalizedSymbols(input.symbols);
  const groupIds = uniqueValues(input.groupIds);
  const kinds = uniqueValues(input.kinds);
  const sides = uniqueValues(input.sides);
  const accountIds = uniqueValues(input.accountIds);
  const startAt = normalizedTimestamp(input.startAt, "startAt");
  const endAt = normalizedTimestamp(input.endAt, "endAt");
  const limit = input.limit ?? DEFAULT_LIMIT;

  if (startAt && endAt && startAt > endAt) {
    throw new AgentTransactionInputError(
      "startAt must be earlier than or equal to endAt.",
    );
  }
  if (
    input.minValueUsd !== undefined &&
    input.maxValueUsd !== undefined &&
    input.minValueUsd > input.maxValueUsd
  ) {
    throw new AgentTransactionInputError(
      "minValueUsd must be less than or equal to maxValueUsd.",
    );
  }
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_AGENT_TRANSACTION_LIMIT
  ) {
    throw new AgentTransactionInputError(
      `limit must be an integer from 1 to ${MAX_AGENT_TRANSACTION_LIMIT}.`,
    );
  }

  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const unknownGroupIds = groupIds.filter(
    (groupId) => !groupsById.has(groupId),
  );
  if (unknownGroupIds.length > 0) {
    throw new AgentTransactionInputError(
      "One or more groupIds do not belong to the authenticated user.",
    );
  }

  const selectedAssetSymbols = new Set(symbols);
  for (const groupId of groupIds) {
    for (const symbol of groupsById.get(groupId)?.symbols ?? []) {
      selectedAssetSymbols.add(symbol.trim().toUpperCase());
    }
  }

  const kindSet = new Set(kinds);
  const sideSet = new Set(sides);
  const accountIdSet = new Set(accountIds);
  const hasAssetFilter = symbols.length > 0 || groupIds.length > 0;

  const matched = snapshot.transactions
    .filter((transaction) => {
      const baseAssetSymbol = transaction.baseAssetSymbol?.toUpperCase() ?? null;
      if (
        hasAssetFilter &&
        (!baseAssetSymbol || !selectedAssetSymbols.has(baseAssetSymbol))
      ) {
        return false;
      }
      if (startAt && transaction.executedAt < startAt) return false;
      if (endAt && transaction.executedAt > endAt) return false;
      if (kindSet.size > 0 && !kindSet.has(transaction.kind)) return false;
      if (sideSet.size > 0 && !sideSet.has(transaction.side)) return false;
      if (
        accountIdSet.size > 0 &&
        !accountIdSet.has(transaction.investmentAccountId)
      ) {
        return false;
      }
      if (input.hasJournal !== undefined) {
        const hasJournal = transaction.journalSummary != null;
        if (hasJournal !== input.hasJournal) return false;
      }
      if (input.minValueUsd !== undefined) {
        if (
          transaction.valueUsd === null ||
          transaction.valueUsd < input.minValueUsd
        ) {
          return false;
        }
      }
      if (input.maxValueUsd !== undefined) {
        if (
          transaction.valueUsd === null ||
          transaction.valueUsd > input.maxValueUsd
        ) {
          return false;
        }
      }
      return true;
    })
    .sort(compareTransactionOrder);

  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const pageStart = cursor
    ? matched.findIndex(
        (transaction) => compareTransactionOrder(transaction, cursor) > 0,
      )
    : 0;
  const startIndex = pageStart === -1 ? matched.length : pageStart;
  const pageTransactions = matched.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + pageTransactions.length < matched.length;
  const transactionIds = pageTransactions.map((transaction) => transaction.id);

  const [journalEntries, journalImages] = await Promise.all([
    getUserInvestmentTransactionJournalEntries(userId, transactionIds),
    getUserInvestmentTransactionJournalImagesForTransactions(
      userId,
      transactionIds,
    ),
  ]);
  const journalByTransaction = new Map(
    journalEntries.map((entry) => [entry.transactionId, entry]),
  );
  const journalImagesByTransaction = imagesByTransaction(journalImages);
  const groupsBySymbol = groupBySymbol(groups);
  const relevantGroupIds = new Set(groupIds);

  const transactions = pageTransactions.map((transaction) => {
    const assetGroup = transaction.baseAssetSymbol
      ? groupsBySymbol.get(transaction.baseAssetSymbol.toUpperCase())
      : undefined;
    if (assetGroup) relevantGroupIds.add(assetGroup.id);

    return {
      ...withoutJournalSummary(transaction),
      assetGroupId: assetGroup?.id ?? null,
      journal: serializeJournal(
        journalByTransaction.get(transaction.id),
        journalImagesByTransaction.get(transaction.id) ?? [],
      ),
    };
  });

  const lastTransaction = pageTransactions.at(-1);

  return {
    retrievedAt: new Date().toISOString(),
    filters: {
      symbols,
      groupIds,
      startAt,
      endAt,
      kinds,
      sides,
      accountIds,
      minValueUsd: input.minValueUsd ?? null,
      maxValueUsd: input.maxValueUsd ?? null,
      hasJournal: input.hasJournal ?? null,
    },
    assetGroups: groups
      .filter((group) => relevantGroupIds.has(group.id))
      .map((group) => ({
        id: group.id,
        name: group.name,
        symbols: group.symbols,
        thesisUpdatedAt: group.updatedAt,
      })),
    transactions,
    page: {
      limit,
      returnedCount: transactions.length,
      totalMatched: matched.length,
      hasMore,
      nextCursor:
        hasMore && lastTransaction ? encodeCursor(lastTransaction) : null,
    },
    historyStatus: snapshot.historyStatus,
    isSyncing: snapshot.isSyncing,
  };
}
