import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

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

const agents = vi.hoisted(() => ({
  AgentPlanError: class AgentPlanError extends Error {},
  getPlanForAgent: vi.fn(),
  listPlansForAgent: vi.fn().mockResolvedValue([]),
  updatePlanForAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/agents/plans", () => agents);
vi.mock("@/lib/agents/portfolio-allocations", () => ({
  getPortfolioAllocationsForAgent: vi.fn(),
}));
vi.mock("@/lib/agents/portfolio-transactions", () => ({
  AgentTransactionInputError: class AgentTransactionInputError extends Error {},
  getPortfolioTransactionsForAgent: vi.fn(),
  MAX_AGENT_TRANSACTION_LIMIT: 100,
}));

const { registerHoldsightTools } = await import(
  "@/lib/agents/register-tools"
);

function sourceFiles(): string[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.join(AGENTS_DIR, file));
}

describe("MCP identity", () => {
  it("comes from the access token's subject", () => {
    const route = readFileSync(MCP_ROUTE, "utf8");

    expect(route).toContain("jwt.sub");
    expect(route).toContain("registerHoldsightTools(server, userId)");
  });

  // The behavioural half: whatever the browser is looking at, a tool reads and
  // writes the account the token names.
  it("scopes every tool to the id the token handed the registration", async () => {
    const tools = new Map<string, (input: never) => Promise<unknown>>();
    const server = {
      registerTool: (
        name: string,
        _config: unknown,
        handler: (input: never) => Promise<unknown>,
      ) => {
        tools.set(name, handler);
      },
    };

    registerHoldsightTools(
      server as unknown as Parameters<typeof registerHoldsightTools>[0],
      "token-user",
    );

    await tools.get("list_plans")?.(undefined as never);
    await tools.get("update_plan")?.({
      planId: "plan-1",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      thesis: "Still holding",
    } as never);

    expect(agents.listPlansForAgent).toHaveBeenCalledWith("token-user");
    expect(agents.updatePlanForAgent).toHaveBeenCalledWith(
      "token-user",
      "plan-1",
      "2026-01-01T00:00:00.000Z",
      { thesis: "Still holding" },
    );
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
