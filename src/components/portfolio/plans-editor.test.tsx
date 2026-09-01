import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlansEditor } from "@/components/portfolio/plans-editor";
import { PlansProvider } from "@/components/portfolio/plans-context";
import type { Plan } from "@/lib/portfolio/plan";

const actions = vi.hoisted(() => ({
  deletePlan: vi.fn(),
  savePlan: vi.fn(),
}));

vi.mock("@/app/(app)/plans/actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/plans",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const EMPTY_DETAILS = {
  thesis: null,
  invalidation: null,
  entry: null,
  exit: null,
  timeframe: null,
};

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    name: "Future BTC",
    color: null,
    details: EMPTY_DETAILS,
    targetAllocationPercent: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    symbols: [],
    ...overrides,
  };
}

function renderEditor(initialPlans: Plan[] = []) {
  return render(
    <PlansProvider initialPlans={initialPlans}>
      <PlansEditor portfolioSummary={{ grandTotalValue: 0, totals: [] }} />
    </PlansProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("PlansEditor", () => {
  it("shows every section of the form before anything is filled in", () => {
    renderEditor();

    for (const field of [
      "Name",
      "Thesis",
      "Invalidation",
      "Entry",
      "Exit",
      "Timeframe",
    ]) {
      expect(screen.getByLabelText(field)).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Create Plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("autosaves a new Plan once it has a name", async () => {
    const created = plan();
    actions.savePlan.mockResolvedValue({
      plans: [created],
      plan: created,
      error: null,
    });
    renderEditor();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Future BTC" },
    });
    expect(actions.savePlan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(actions.savePlan).toHaveBeenCalledWith(null, {
        name: "Future BTC",
        color: null,
        details: EMPTY_DETAILS,
        targetAllocationPercent: null,
        symbols: [],
      });
    });
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("does not autosave while the Plan has no name", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Thesis"), {
      target: { value: "Compute demand keeps growing." },
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(actions.savePlan).not.toHaveBeenCalled();
  });

  it("saves later edits against the existing Plan id", async () => {
    const existing = plan();
    actions.savePlan.mockResolvedValue({
      plans: [existing],
      plan: existing,
      error: null,
    });
    renderEditor([existing]);

    fireEvent.change(screen.getByLabelText("Thesis"), {
      target: { value: "Halving supply shock." },
    });
    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(actions.savePlan).toHaveBeenCalledWith("plan-1", {
        name: "Future BTC",
        color: null,
        details: { ...EMPTY_DETAILS, thesis: "Halving supply shock." },
        targetAllocationPercent: null,
        symbols: [],
      });
    });
  });

  it("coalesces rapid edits into a single save", async () => {
    const existing = plan();
    actions.savePlan.mockResolvedValue({
      plans: [existing],
      plan: existing,
      error: null,
    });
    renderEditor([existing]);

    const thesis = screen.getByLabelText("Thesis");
    fireEvent.change(thesis, { target: { value: "A" } });
    fireEvent.change(thesis, { target: { value: "AB" } });
    fireEvent.change(thesis, { target: { value: "ABC" } });
    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => expect(actions.savePlan).toHaveBeenCalledTimes(1));
    expect(actions.savePlan.mock.calls[0][1].details.thesis).toBe("ABC");
  });

  it("surfaces a save failure", async () => {
    actions.savePlan.mockResolvedValue({
      plans: [],
      plan: null,
      error: "Plan name must be 60 characters or fewer.",
    });
    renderEditor();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Future BTC" },
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(
      await screen.findByText("Plan name must be 60 characters or fewer."),
    ).toBeTruthy();
  });
});
