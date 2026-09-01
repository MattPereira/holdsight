import "server-only";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  AgentPlanError,
  getPlanForAgent,
  listPlansForAgent,
  updatePlanForAgent,
} from "@/lib/agents/plans";
import { getPortfolioAllocationsForAgent } from "@/lib/agents/portfolio-allocations";
import {
  AgentTransactionInputError,
  getPortfolioTransactionsForAgent,
  MAX_AGENT_TRANSACTION_LIMIT,
} from "@/lib/agents/portfolio-transactions";
import {
  planListResultSchema,
  planResultSchema,
  portfolioAllocationsResultSchema,
  portfolioTransactionsResultSchema,
} from "@/lib/agents/output-schemas";
import { MAX_PLAN_TEXT_LENGTH } from "@/lib/portfolio/plan";

const planSection = (description: string) =>
  z
    .string()
    .trim()
    .max(MAX_PLAN_TEXT_LENGTH)
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
        "Read the current Holdsight portfolio allocations and Plans without refreshing external account balances. Current and target allocation percentages use a 0–100 scale.",
      inputSchema: {},
      outputSchema: portfolioAllocationsResultSchema.shape,
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
      outputSchema: portfolioAllocationsResultSchema.shape,
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

function registerPlanTools(server: McpServer, userId: string) {
  server.registerTool(
    "list_plans",
    {
      title: "List Plans",
      description:
        "List the authenticated user's Plans with IDs, names, assigned symbols, target allocations, completion status, and last-updated timestamps. Use this compact index to identify a Plan, then call get_plan to read it.",
      inputSchema: {},
      outputSchema: planListResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const plans = await listPlansForAgent(userId);
      const result = { plans };

      return {
        content: [],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_plan",
    {
      title: "Get Plan",
      description:
        "Read one Plan and its updatedAt timestamp without refreshing external providers. Use the returned updatedAt value when updating the Plan.",
      inputSchema: {
        planId: z
          .string()
          .uuid()
          .describe("Plan ID returned by list_plans or get_portfolio_allocations."),
      },
      outputSchema: planResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ planId }) => {
      try {
        const plan = await getPlanForAgent(userId, planId);

        return {
          content: [],
          structuredContent: plan,
        };
      } catch (error) {
        if (error instanceof AgentPlanError) {
          return toolError(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "update_plan",
    {
      title: "Update Plan",
      description:
        "Patch the prose fields for one Holdsight Plan. Read the Plan first and pass its updatedAt value to prevent overwriting a concurrent edit. This tool cannot change asset assignment, name, color, or target allocation.",
      inputSchema: {
        planId: z
          .string()
          .uuid()
          .describe(
            "Plan ID returned by list_plans, get_portfolio_allocations, or get_plan.",
          ),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .describe(
            "Pass the exact updatedAt value from the most recent get_plan response. If the update reports a conflict, fetch the Plan again, reconcile the changes, and retry.",
          ),
        thesis: planSection("The reasoning for owning the Plan's assets."),
        invalidation: planSection("What would prove the Thesis wrong."),
        entry: planSection("Conditions for starting or increasing exposure."),
        exit: planSection("Conditions for reducing or closing exposure."),
      },
      outputSchema: planResultSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ planId, expectedUpdatedAt, ...patch }) => {
      try {
        const plan = await updatePlanForAgent(
          userId,
          planId,
          expectedUpdatedAt,
          patch,
        );

        return {
          content: [],
          structuredContent: plan,
        };
      } catch (error) {
        if (error instanceof AgentPlanError) {
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
        "Read stored Holdsight investment transactions with optional asset, Plan, date, kind, side, account, value, and journal filters, plus compact references to relevant Plans. Call get_plan with a returned Plan ID when Plan contents are needed. All filters are optional; arrays use OR, filter categories use AND, and symbols and Plans match the base asset. Results are newest first. This tool does not refresh external providers.",
      inputSchema: {
        symbols: z
          .array(z.string().trim().min(1).max(64))
          .min(1)
          .max(100)
          .optional()
          .describe("Base asset symbols to match, such as BTC or AAPL."),
        planIds: z
          .array(z.string().uuid())
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Plan IDs returned by get_portfolio_allocations, list_plans, or prior transaction results. Symbols and Plans are combined as a union.",
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
      outputSchema: portfolioTransactionsResultSchema.shape,
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
  registerPlanTools(server, userId);
  registerPortfolioTransactionTools(server, userId);
}
