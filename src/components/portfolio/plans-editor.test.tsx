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

  it("edits the target allocation in 5% increments", async () => {
    const existing = plan({ targetAllocationPercent: 50 });
    const saved = plan({ targetAllocationPercent: 45 });
    actions.savePlan.mockResolvedValue({
      plans: [saved],
      plan: saved,
      error: null,
    });
    renderEditor([existing]);

    fireEvent.click(
      screen.getByRole("button", { name: "Edit target allocation" }),
    );
    const target = screen.getByLabelText("Target allocation");
    fireEvent.change(target, { target: { value: "43" } });
    fireEvent.blur(target);

    expect(
      screen.getByRole("button", { name: "Edit target allocation" })
        .textContent,
    ).toBe("45%");

    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => {
      expect(actions.savePlan).toHaveBeenCalledWith("plan-1", {
        name: "Future BTC",
        color: null,
        details: EMPTY_DETAILS,
        targetAllocationPercent: 45,
        symbols: [],
      });
    });
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

  describe("the Plan picker", () => {
    it("renders one checked radio per Plan and switches the form on click", async () => {
      const btc = plan({ id: "plan-1", name: "Future BTC" });
      const eth = plan({ id: "plan-2", name: "Ethereum" });
      renderEditor([btc, eth]);

      const group = screen.getByRole("radiogroup", { name: "Plans" });
      const chips = screen.getAllByRole("radio");
      expect(group).toBeTruthy();
      expect(chips.map((chip) => chip.textContent)).toEqual([
        "Future BTC",
        "Ethereum",
      ]);
      expect(chips[0].getAttribute("aria-checked")).toBe("true");
      expect(screen.getByLabelText("Name")).toHaveProperty(
        "value",
        "Future BTC",
      );

      fireEvent.click(chips[1]);

      await waitFor(() => {
        expect(screen.getByLabelText("Name")).toHaveProperty(
          "value",
          "Ethereum",
        );
      });
      expect(screen.getAllByRole("radio")[1].getAttribute("aria-checked")).toBe(
        "true",
      );
    });

    it("moves selection with the arrow keys", async () => {
      renderEditor([
        plan({ id: "plan-1", name: "Future BTC" }),
        plan({ id: "plan-2", name: "Ethereum" }),
      ]);

      const chips = screen.getAllByRole("radio");
      chips[0].focus();
      fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Plans" }), {
        key: "ArrowRight",
      });

      await waitFor(() => {
        expect(screen.getByLabelText("Name")).toHaveProperty(
          "value",
          "Ethereum",
        );
      });
    });

    it("adds a transient New Plan chip while a Plan is being created", async () => {
      renderEditor([plan({ id: "plan-1", name: "Future BTC" })]);

      expect(screen.getAllByRole("radio")).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        const chips = screen.getAllByRole("radio");
        expect(chips.map((chip) => chip.textContent)).toEqual([
          "Future BTC",
          "New Plan",
        ]);
        expect(chips[1].getAttribute("aria-checked")).toBe("true");
      });
    });
  });
});
