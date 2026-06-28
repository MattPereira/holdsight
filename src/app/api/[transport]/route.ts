import { mcpHandler } from "@better-auth/oauth-provider";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { getPortfolioAllocationsForAgent } from "@/lib/agents/portfolio-allocations";
import {
  AgentTransactionInputError,
  getPortfolioTransactionsForAgent,
  MAX_AGENT_TRANSACTION_LIMIT,
} from "@/lib/agents/portfolio-transactions";

const baseURL = process.env.BETTER_AUTH_URL;

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be configured.");
}

const mcpResource = new URL("/api/mcp", baseURL).toString();

const authenticatedHandler = mcpHandler(
  {
    jwksUrl: new URL("/api/auth/jwks", baseURL).toString(),
    verifyOptions: {
      issuer: baseURL,
      audience: mcpResource,
    },
  },
  (request, jwt) => {
    if (typeof jwt.sub !== "string") {
      return new Response("OAuth access token is missing a user subject.", {
        status: 401,
      });
    }
    const userId = jwt.sub;

    return createMcpHandler(
      (server) => {
        server.registerTool(
          "get_portfolio_allocations",
          {
            title: "Get Portfolio Allocations",
            description:
              "Read the current Holdsight portfolio allocations without refreshing external account balances.",
            inputSchema: {},
          },
          async () => {
            const allocations = await getPortfolioAllocationsForAgent(userId);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(allocations, null, 2),
                },
              ],
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
              content: [
                {
                  type: "text",
                  text: JSON.stringify(allocations, null, 2),
                },
              ],
              structuredContent: allocations,
            };
          },
        );

        server.registerTool(
          "get_portfolio_transactions",
          {
            title: "Get Portfolio Transactions",
            description:
              "Read stored Holdsight investment transactions with optional asset, group, date, transaction, account, value, and journal filters. All filters are optional; arrays use OR, filter categories use AND, and symbols and groups match the base asset. Results are newest first. This tool does not refresh external providers.",
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
                .describe(
                  `Page size. Defaults to ${MAX_AGENT_TRANSACTION_LIMIT}.`,
                ),
              cursor: z
                .string()
                .min(1)
                .max(1024)
                .optional()
                .describe("Opaque nextCursor returned by a previous call."),
            },
          },
          async (input) => {
            try {
              const transactions = await getPortfolioTransactionsForAgent(
                userId,
                input,
              );

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(transactions, null, 2),
                  },
                ],
                structuredContent: transactions,
              };
            } catch (error) {
              if (error instanceof AgentTransactionInputError) {
                return {
                  isError: true,
                  content: [{ type: "text", text: error.message }],
                };
              }
              throw error;
            }
          },
        );
      },
      {
        serverInfo: {
          name: "holdsight",
          version: "0.1.0",
        },
      },
      {
        basePath: "/api",
        disableSse: true,
        maxDuration: 60,
      },
    )(request);
  },
);

export { authenticatedHandler as GET, authenticatedHandler as POST };
