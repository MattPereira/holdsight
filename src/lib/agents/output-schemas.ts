import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });

const transactionKindSchema = z.enum([
  "trade",
  "transfer",
  "fee",
  "dividend",
  "interest",
  "deposit",
  "withdrawal",
  "adjustment",
  "unknown",
]);

const transactionSideSchema = z.enum([
  "buy",
  "sell",
  "swap",
  "open",
  "close",
  "increase",
  "decrease",
  "receive",
  "send",
  "unknown",
]);

const transactionStatusSchema = z.enum([
  "confirmed",
  "pending",
  "failed",
  "canceled",
  "unknown",
]);

const planMissingFieldSchema = z.enum([
  "thesis",
  "invalidation",
  "entry",
  "exit",
  "targetAllocationPercent",
]);

export const planDetailsSchema = z.object({
  thesis: z.string().nullable(),
  invalidation: z.string().nullable(),
  entry: z.string().nullable(),
  exit: z.string().nullable(),
});

export const planCompletionSchema = z.object({
  completedFields: z.number().int().min(0).max(5),
  totalFields: z.literal(5),
  isComplete: z.boolean(),
  missing: z.array(planMissingFieldSchema),
});

export const planResultSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  symbols: z.array(z.string()),
  details: planDetailsSchema,
  targetAllocationPercent: z.number().min(0).max(100).nullable(),
  completion: planCompletionSchema,
  updatedAt: timestampSchema,
});

export const planListResultSchema = z.object({
  plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      symbols: z.array(z.string()),
      targetAllocationPercent: z.number().min(0).max(100).nullable(),
      completion: planCompletionSchema,
      updatedAt: timestampSchema,
    }),
  ),
});

const portfolioAllocationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("asset"),
    symbol: z.string(),
    name: z.string().nullable(),
    amount: z.number(),
    valueUsd: z.number(),
    currentAllocationPercent: z.number(),
  }),
  z.object({
    type: z.literal("plan"),
    id: z.string().uuid(),
    name: z.string(),
    details: planDetailsSchema,
    targetAllocationPercent: z.number().min(0).max(100).nullable(),
    completion: planCompletionSchema,
    valueUsd: z.number(),
    currentAllocationPercent: z.number(),
    members: z.array(
      z.object({
        symbol: z.string(),
        name: z.string().nullable(),
        amount: z.number(),
        valueUsd: z.number(),
        currentAllocationPercent: z.number(),
      }),
    ),
  }),
]);

export const portfolioAllocationsResultSchema = z.object({
  retrievedAt: timestampSchema,
  refreshed: z.boolean(),
  portfolio: z.object({
    grandTotalValueUsd: z.number(),
    allocations: z.array(portfolioAllocationSchema),
  }),
});

/*
 * Keep journal schemas below the Plan contract so transaction tools can reuse
 * the same timestamps and Plan identifiers without a second public model.
 */
const journalSchema = z.object({
  id: z.string().uuid(),
  note: z.string().nullable(),
  tradeReason: z
    .enum([
      "dip_buy",
      "breakout_buy",
      "take_profit",
      "stop_loss",
      "rebalance",
      "thesis_change",
      "cash_raise",
    ])
    .nullable(),
  emotions: z.array(
    z.enum([
      "calm",
      "cautious",
      "panicked",
      "fomo",
      "frustrated",
      "euphoric",
    ]),
  ),
  marketBias: z.number().int().min(1).max(10).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  images: z.array(
    z.object({
      id: z.string().uuid(),
      url: z.string().url(),
      originalFilename: z.string(),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      sizeBytes: z.number().int().nonnegative(),
      sortOrder: z.number().int().nonnegative(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
    }),
  ),
});

const transactionSchema = z.object({
  id: z.string().uuid(),
  investmentAccountId: z.string().uuid(),
  accountLabel: z.string().nullable(),
  sourceTransactionId: z.string(),
  sourceAccountId: z.string().nullable(),
  executedAt: timestampSchema,
  settledAt: timestampSchema.nullable(),
  kind: transactionKindSchema,
  side: transactionSideSchema,
  baseAssetSymbol: z.string().nullable(),
  baseAssetId: z.string().nullable(),
  baseAmount: z.number().nullable(),
  quoteAssetSymbol: z.string().nullable(),
  quoteAmount: z.number().nullable(),
  priceQuote: z.number().nullable(),
  valueUsd: z.number().nullable(),
  feeAmount: z.number().nullable(),
  feeAssetSymbol: z.string().nullable(),
  status: transactionStatusSchema,
  displayType: z.enum(["transaction", "perp_event"]).optional(),
  perpEventType: z.enum(["open", "increase", "decrease", "close"]).optional(),
  perpPositionSide: z.enum(["long", "short"]).optional(),
  entryPrice: z.number().nullable().optional(),
  exitPrice: z.number().nullable().optional(),
  grossPnlUsd: z.number().nullable().optional(),
  netPnlUsd: z.number().nullable().optional(),
  planId: z.string().uuid().nullable(),
  journal: journalSchema.nullable(),
});

export const portfolioTransactionsResultSchema = z.object({
  retrievedAt: timestampSchema,
  filters: z.object({
    symbols: z.array(z.string()),
    planIds: z.array(z.string().uuid()),
    startAt: timestampSchema.nullable(),
    endAt: timestampSchema.nullable(),
    kinds: z.array(transactionKindSchema),
    sides: z.array(transactionSideSchema),
    accountIds: z.array(z.string().uuid()),
    minValueUsd: z.number().nonnegative().nullable(),
    maxValueUsd: z.number().nonnegative().nullable(),
    hasJournal: z.boolean().nullable(),
  }),
  plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      symbols: z.array(z.string()),
      updatedAt: timestampSchema,
    }),
  ),
  transactions: z.array(transactionSchema),
  page: z.object({
    limit: z.number().int().positive(),
    returnedCount: z.number().int().nonnegative(),
    totalMatched: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
  historyStatus: z.object({
    earliestTransactionAt: timestampSchema.nullable(),
    latestTransactionAt: timestampSchema.nullable(),
    latestTransactionUpdatedAt: timestampSchema.nullable().optional(),
    hasMore: z.boolean(),
    phase: z.enum(["backfilling", "catching_up", "up_to_date"]).optional(),
  }),
  isSyncing: z.boolean(),
});
