import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MCP clients authenticate with a token, and the identity in that token is the
 * only account they may touch. View As is a browser cookie that says which
 * account a *page* is showing; if it ever leaked into this path, a switched
 * browser tab would silently redirect an agent's reads and writes.
 *
 * Checked structurally because the guarantee is an absence: the agent modules
 * take the user id as an argument and have nowhere else to get one from.
 */
const AGENTS_DIR = path.join(process.cwd(), "src/lib/agents");
const MCP_ROUTE = path.join(process.cwd(), "src/app/api/[transport]/route.ts");

const BROWSER_IDENTITY = [
  "getCurrentUserId",
  "getCurrentActor",
  "@/lib/auth/session",
  "@/lib/auth/view-as",
  "next/headers",
];

function sourceFiles(): string[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.join(AGENTS_DIR, file));
}

describe("MCP identity", () => {
  it("comes from the access token's subject", () => {
    const route = readFileSync(MCP_ROUTE, "utf8");

    expect(route).toContain("const userId = jwt.sub;");
    expect(route).toContain("registerHoldsightTools(server, userId)");
  });

  it.each([...sourceFiles(), MCP_ROUTE])(
    "%s never reads the browser's viewed account",
    (file) => {
      const source = readFileSync(file, "utf8");

      for (const reference of BROWSER_IDENTITY) {
        expect(source).not.toContain(reference);
      }
    },
  );
});
