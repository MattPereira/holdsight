import { protectedResourceHandler } from "mcp-handler";

const baseURL = process.env.BETTER_AUTH_URL;

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be configured.");
}

export const GET = protectedResourceHandler({
  authServerUrls: [baseURL],
  resourceUrl: new URL("/api/mcp", baseURL).toString(),
});
