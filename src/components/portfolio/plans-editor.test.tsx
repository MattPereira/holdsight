import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewedAccountProvider } from "@/components/auth/viewed-account-context";
import { PlansEditor } from "@/components/portfolio/plans-editor";
import { PlansProvider } from "@/components/portfolio/plans-context";
import {
  emptyPlanDetails,
  PLAN_FIELDS,
  type Plan,
} from "@/lib/portfolio/plan";

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

const EMPTY_DETAILS = emptyPlanDetails();

/** The name lives behind the settings button now, so editing it starts there. */
function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Plan settings" }));
}

function openAssetSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Asset settings" }));
}

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

function renderEditor(initialPlans: Plan[] = [], canWrite = true) {
  return render(
    <ViewedAccountProvider
      capabilities={{ canWrite, canManageConnections: false }}
    >
      <PlansProvider initialPlans={initialPlans}>
        <PlansEditor portfolioSummary={{ grandTotalValue: 0, totals: [] }} />
      </PlansProvider>
    </ViewedAccountProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // jsdom implements none of these, and the popover's command list reaches
  // for all of them the moment it opens.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("PlansEditor", () => {
  it("shows every section of the form before anything is filled in", async () => {
    renderEditor();

    for (const field of ["Plan", ...PLAN_FIELDS.map((f) => f.label)]) {
      expect(screen.getByLabelText(field)).toBeTruthy();
    }
    openSettings();
    expect(await screen.findByLabelText("Name")).toBeTruthy();
    // The form autosaves, so it has no submit or cancel of its own.
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
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

    openSettings();
    fireEvent.change(await screen.findByLabelText("Name"), {
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

    openSettings();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Future BTC" },
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(
      await screen.findByText("Plan name must be 60 characters or fewer."),
    ).toBeTruthy();
  });

  describe("the Plan switcher", () => {
    it("shows the active Plan's name on the control that opens the list", () => {
      renderEditor([
        plan({ id: "plan-1", name: "Future BTC" }),
        plan({ id: "plan-2", name: "Ethereum" }),
      ]);

      const trigger = screen.getByRole("button", { name: "Switch Plan" });
      expect(trigger.textContent).toContain("Future BTC");
      expect(screen.getByLabelText("Plan")).toBe(trigger);
    });

    it("switches the form when another Plan is picked", async () => {
      renderEditor([
        plan({ id: "plan-1", name: "Future BTC" }),
        plan({ id: "plan-2", name: "Ethereum" }),
      ]);

      fireEvent.click(screen.getByRole("button", { name: "Switch Plan" }));
      fireEvent.click(await screen.findByText("Ethereum"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Switch Plan" }).textContent,
        ).toContain("Ethereum");
      });
    });

    it("clears every asset from the Plan at once", async () => {
      actions.savePlan.mockResolvedValue({
        plans: [plan({ symbols: [] })],
        plan: plan({ symbols: [] }),
        error: null,
      });
      renderEditor([plan({ symbols: ["BTC", "ETH"] })]);

      expect(screen.getByLabelText("Assets").textContent).toContain("BTC");
      openAssetSettings();
      fireEvent.click(
        await screen.findByRole("button", { name: "Clear assets" }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Assets").textContent).toContain(
          "No assets",
        );
      });
    });

    it("edits the target allocation from the settings popover", async () => {
      const existing = plan({ targetAllocationPercent: null });
      actions.savePlan.mockResolvedValue({
        plans: [existing],
        plan: existing,
        error: null,
      });
      renderEditor([existing]);

      openSettings();
      const target = await screen.findByLabelText("Target allocation");
      fireEvent.change(target, { target: { value: "23" } });
      fireEvent.blur(target);

      expect(target).toHaveProperty("value", "25");
      await vi.advanceTimersByTimeAsync(1000);
      await waitFor(() => {
        expect(actions.savePlan).toHaveBeenCalledWith(
          "plan-1",
          expect.objectContaining({ targetAllocationPercent: 25 }),
        );
      });
    });

    it("adds a ticker the portfolio doesn't hold", async () => {
      const existing = plan({ symbols: [] });
      actions.savePlan.mockResolvedValue({
        plans: [existing],
        plan: existing,
        error: null,
      });
      renderEditor([existing]);

      openAssetSettings();
      fireEvent.change(await screen.findByLabelText("Add ticker"), {
        target: { value: "sol" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));

      await waitFor(() => {
        expect(screen.getByLabelText("Assets").textContent).toContain("SOL");
      });
      await vi.advanceTimersByTimeAsync(1000);
      await waitFor(() => {
        expect(actions.savePlan).toHaveBeenCalledWith(
          "plan-1",
          expect.objectContaining({ symbols: ["SOL"] }),
        );
      });
    });

    it("refuses a ticker the Plan already holds", async () => {
      renderEditor([plan({ symbols: ["BTC"] })]);

      openAssetSettings();
      fireEvent.change(await screen.findByLabelText("Add ticker"), {
        target: { value: "btc" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(
        await screen.findByText("BTC is already in this Plan."),
      ).toBeTruthy();
    });

    it("keeps starting a Plan out of the list of Plans", async () => {
      renderEditor([plan({ id: "plan-1", name: "Future BTC" })]);

      fireEvent.click(screen.getByRole("button", { name: "Switch Plan" }));
      await screen.findByPlaceholderText("Search Plans...");

      expect(screen.queryByText("New Plan")).toBeNull();
    });

    it("starts a blank Plan from the settings popover", async () => {
      renderEditor([plan({ id: "plan-1", name: "Future BTC" })]);

      openSettings();
      fireEvent.click(await screen.findByRole("button", { name: "New Plan" }));

      await waitFor(() => {
        expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
      });
    });
  });
});

/** A member looking at the other granted account (ADR 0005). */
describe("PlansEditor on a read-only account", () => {
  it("keeps the Plan's prose readable but not editable", async () => {
    renderEditor([plan()], false);

    const thesis = screen.getByLabelText("Thesis") as HTMLTextAreaElement;
    expect(thesis.readOnly).toBe(true);

    fireEvent.change(thesis, { target: { value: "Not mine to write." } });
    await vi.advanceTimersByTimeAsync(2000);

    expect(actions.savePlan).not.toHaveBeenCalled();
  });

  it("offers no way to create or delete a Plan", async () => {
    renderEditor([plan()], false);

    openSettings();
    await screen.findByLabelText("Name");
    expect(screen.queryByRole("button", { name: /New Plan/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete Plan/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit target allocation" }),
    ).toBeNull();
  });

  // Reading the other account is the point of switching to it.
  it("still lets the reader switch between Plans", () => {
    renderEditor([plan()], false);

    expect(
      (screen.getByRole("button", { name: "Switch Plan" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
