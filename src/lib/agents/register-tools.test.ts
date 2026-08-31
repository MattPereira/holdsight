import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

import { registerHoldsightTools } from "@/lib/agents/register-tools";

vi.mock("@/lib/agents/plans", () => ({
  AgentPlanError: class AgentPlanError extends Error {},
  getPlanForAgent: vi.fn(),
  listPlansForAgent: vi.fn(),
  updatePlanForAgent: vi.fn(),
}));
vi.mock("@/lib/agents/portfolio-allocations", () => ({
  getPortfolioAllocationsForAgent: vi.fn(),
}));
vi.mock("@/lib/agents/portfolio-transactions", () => ({
  AgentTransactionInputError: class AgentTransactionInputError extends Error {},
  getPortfolioTransactionsForAgent: vi.fn(),
  MAX_AGENT_TRANSACTION_LIMIT: 100,
}));

describe("registerHoldsightTools", () => {
  it("registers Plan tools without legacy asset-group tools", () => {
    const registerTool = vi.fn();
    registerHoldsightTools({ registerTool } as unknown as McpServer, "user-1");

    const names = registerTool.mock.calls.map(([name]) => name);
    expect(names).toEqual([
      "get_portfolio_allocations",
      "refresh_portfolio_allocations",
      "list_plans",
      "get_plan",
      "update_plan",
      "get_portfolio_transactions",
    ]);
    expect(names.some((name) => String(name).includes("asset_group"))).toBe(
      false,
    );
  });
});
