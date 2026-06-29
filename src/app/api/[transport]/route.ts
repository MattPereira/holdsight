import { mcpHandler } from "@better-auth/oauth-provider";
import { createMcpHandler } from "mcp-handler";

import { registerHoldsightTools } from "@/lib/agents/register-tools";

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
        registerHoldsightTools(server, userId);
      },
      {
        serverInfo: {
          name: "holdsight",
          version: "0.4.0",
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
