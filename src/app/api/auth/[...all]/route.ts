import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";

const handlers = toNextJsHandler(auth);

const JWKS_PATH = "/api/auth/jwks";

// MCP token verification refetches the JWKS every 5 minutes, and serving it
// reads the `jwks` table — which wakes the Neon compute just as its 5-minute
// idle timer would have suspended it. The key set is public and near-static,
// so let the CDN answer those refetches instead of the database. See
// docs/adr/0009-cache-the-jwks-response.md.
const JWKS_CACHE_CONTROL =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const response = await handlers.GET(request);

  if (new URL(request.url).pathname !== JWKS_PATH) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", JWKS_CACHE_CONTROL);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const POST = handlers.POST;
