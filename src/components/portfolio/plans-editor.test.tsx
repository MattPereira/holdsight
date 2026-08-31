import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlansEditor } from "@/components/portfolio/plans-editor";
import { PlansProvider } from "@/components/portfolio/plans-context";

const actions = vi.hoisted(() => ({
  createPlan: vi.fn(),
  deletePlan: vi.fn(),
  updatePlan: vi.fn(),
}));

vi.mock("@/app/(app)/plans/actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/plans",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlansEditor", () => {
  it("creates a Plan without assigning an asset", async () => {
    actions.createPlan.mockResolvedValue({ plans: [], error: null });
    render(
      <PlansProvider initialPlans={[]}>
        <PlansEditor portfolioSummary={{ grandTotalValue: 0, totals: [] }} />
      </PlansProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Plan" }));

    for (const field of [
      "Thesis",
      "Invalidation",
      "Entry",
      "Exit",
      "Timeframe",
    ]) {
      expect(screen.getByLabelText(field)).toBeTruthy();
    }
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Future BTC" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Plan" }));

    await waitFor(() => {
      expect(actions.createPlan).toHaveBeenCalledWith({
        name: "Future BTC",
        color: null,
        details: {
          thesis: null,
          invalidation: null,
          entry: null,
          exit: null,
          timeframe: null,
        },
        targetAllocationPercent: null,
        symbols: [],
      });
    });
  });
});
