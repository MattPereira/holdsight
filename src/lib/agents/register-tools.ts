import "server-only";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  AgentAssetGroupThesisError,
  getAssetGroupThesisForAgent,
  listAssetGroupThesesForAgent,
  updateAssetGroupThesisForAgent,
} from "@/lib/agents/asset-group-theses";
import { getPortfolioAllocationsForAgent } from "@/lib/agents/portfolio-allocations";
import {
  AgentTransactionInputError,
  getPortfolioTransactionsForAgent,
  MAX_AGENT_TRANSACTION_LIMIT,
} from "@/lib/agents/portfolio-transactions";
import { MAX_ASSET_GROUP_THESIS_SECTION_LENGTH } from "@/lib/portfolio/asset-group-thesis";

const thesisSection = (description: string) =>
  z
    .string()
    .trim()
    .max(MAX_ASSET_GROUP_THESIS_SECTION_LENGTH)
    .nullable()
    .optional()
    .describe(
      `${description} Omit to leave unchanged; use null or blank text to clear.`,
    );

function toolError(error: Error) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: error.message }],
  };
}

function registerPortfolioAllocationTools(server: McpServer, userId: string) {
  server.registerTool(
    "get_portfolio_allocations",
    {
      title: "Get Portfolio Allocations",
      description:
        "Read the current Holdsight portfolio allocations and structured asset-group theses without refreshing external account balances. Current allocation percentages use a 0–100 scale.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const allocations = await getPortfolioAllocationsForAgent(userId);

      return {
        content: [],
        structuredContent: allocations,
      };
    },
  );

  server.registerTool(
    "refresh_portfolio_allocations",
    {
      title: "Refresh Portfolio Allocations",
      description:
        "Refresh external account balances, then return Holdsight portfolio allocations. This may call third-party providers.",
      inputSchema: {
        confirmRefresh: z
          .boolean()
          .describe("Must be true because this tool can call external APIs."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ confirmRefresh }) => {
      if (!confirmRefresh) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Set confirmRefresh to true to refresh portfolio data.",
            },
          ],
        };
      }

      const allocations = await getPortfolioAllocationsForAgent(userId, {
        refresh: true,
      });

      return {
        content: [],
        structuredContent: allocations,
      };
    },
  );
}

function registerAssetGroupThesisTools(server: McpServer, userId: string) {
  server.registerTool(
    "list_asset_group_theses",
    {
      title: "List Asset Group Theses",
      description:
        "List the authenticated user's asset-group theses with IDs, names, member symbols, completion status, and update versions. Use this compact index to identify a thesis, then call get_asset_group_thesis to read its contents.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const theses = await listAssetGroupThesesForAgent(userId);
      const result = { theses };

      return {
        content: [],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_asset_group_thesis",
    {
      title: "Get Asset Group Thesis",
      description:
        "Read one structured asset-group thesis and its updatedAt version without refreshing external providers. Use the returned updatedAt value when updating the thesis.",
      inputSchema: {
        assetGroupId: z
          .string()
          .uuid()
          .describe(
            "Asset group ID returned by list_asset_group_theses or get_portfolio_allocations.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ assetGroupId }) => {
      try {
        const thesis = await getAssetGroupThesisForAgent(userId, assetGroupId);

        return {
          content: [],
          structuredContent: thesis,
        };
      } catch (error) {
        if (error instanceof AgentAssetGroupThesisError) {
          return toolError(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "update_asset_group_thesis",
    {
      title: "Update Asset Group Thesis",
      description:
        "Patch the research text for one Holdsight asset-group thesis. Read the thesis first and pass its updatedAt value to prevent overwriting a concurrent edit. This tool cannot change group membership, display settings, or target allocation.",
      inputSchema: {
        assetGroupId: z
          .string()
          .uuid()
          .describe(
            "Asset group ID returned by list_asset_group_theses, get_portfolio_allocations, or get_asset_group_thesis.",
          ),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .describe("Exact updatedAt value returned by get_asset_group_thesis."),
        summary: thesisSection("Concise thesis summary."),
        bullCase: thesisSection("Evidence and reasoning for the bull case."),
        bearCase: thesisSection("Evidence and reasoning for the bear case."),
        invalidationCriteria: thesisSection(
          "Observable conditions that would invalidate the thesis.",
        ),
        allocationStrategyNotes: thesisSection(
          "Notes connecting the thesis to allocation strategy.",
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ assetGroupId, expectedUpdatedAt, ...patch }) => {
      try {
        const thesis = await updateAssetGroupThesisForAgent(
          userId,
          assetGroupId,
          expectedUpdatedAt,
          patch,
        );

        return {
          content: [],
          structuredContent: thesis,
        };
      } catch (error) {
        if (error instanceof AgentAssetGroupThesisError) {
          return toolError(error);
        }
        throw error;
      }
    },
  );
}

function registerPortfolioTransactionTools(server: McpServer, userId: string) {
  server.registerTool(
    "get_portfolio_transactions",
    {
      title: "Get Portfolio Transactions",
      description:
        "Read stored Holdsight investment transactions with optional asset, group, date, transaction, account, value, and journal filters, plus compact references to relevant asset groups. Call get_asset_group_thesis with a returned group ID when thesis contents are needed. All filters are optional; arrays use OR, filter categories use AND, and symbols and groups match the base asset. Results are newest first. This tool does not refresh external providers.",
      inputSchema: {
        symbols: z
          .array(z.string().trim().min(1).max(64))
          .min(1)
          .max(100)
          .optional()
          .describe("Base asset symbols to match, such as BTC or AAPL."),
        groupIds: z
          .array(z.string().uuid())
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Asset group IDs returned by get_portfolio_allocations. Symbols and groups are combined as a union.",
          ),
        startAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Inclusive executed-at lower bound as ISO 8601."),
        endAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Inclusive executed-at upper bound as ISO 8601."),
        kinds: z
          .array(
            z.enum([
              "trade",
              "transfer",
              "fee",
              "dividend",
              "interest",
              "deposit",
              "withdrawal",
              "adjustment",
              "unknown",
            ]),
          )
          .min(1)
          .optional()
          .describe("Transaction kinds to include."),
        sides: z
          .array(
            z.enum([
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
            ]),
          )
          .min(1)
          .optional()
          .describe("Transaction sides to include."),
        accountIds: z
          .array(z.string().uuid())
          .min(1)
          .max(100)
          .optional()
          .describe("Investment account IDs to include."),
        minValueUsd: z
          .number()
          .min(0)
          .optional()
          .describe("Inclusive minimum transaction value in USD."),
        maxValueUsd: z
          .number()
          .min(0)
          .optional()
          .describe("Inclusive maximum transaction value in USD."),
        hasJournal: z
          .boolean()
          .optional()
          .describe(
            "True for transactions with journal entries; false for transactions without them.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_AGENT_TRANSACTION_LIMIT)
          .optional()
          .describe(`Page size. Defaults to ${MAX_AGENT_TRANSACTION_LIMIT}.`),
        cursor: z
          .string()
          .min(1)
          .max(1024)
          .optional()
          .describe("Opaque nextCursor returned by a previous call."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const transactions = await getPortfolioTransactionsForAgent(
          userId,
          input,
        );

        return {
          content: [],
          structuredContent: transactions,
        };
      } catch (error) {
        if (error instanceof AgentTransactionInputError) {
          return toolError(error);
        }
        throw error;
      }
    },
  );
}

export function registerHoldsightTools(server: McpServer, userId: string) {
  registerPortfolioAllocationTools(server, userId);
  registerAssetGroupThesisTools(server, userId);
  registerPortfolioTransactionTools(server, userId);
}
