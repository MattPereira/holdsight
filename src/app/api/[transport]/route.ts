import { mcpHandler } from "@better-auth/oauth-provider";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { getAgentPortfolioAllocations } from "@/lib/portfolio/agent-allocations";

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
            const allocations = await getAgentPortfolioAllocations(userId);

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

            const allocations = await getAgentPortfolioAllocations(userId, {
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
