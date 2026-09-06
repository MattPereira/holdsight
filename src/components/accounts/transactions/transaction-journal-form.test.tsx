import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewedAccountProvider } from "@/components/auth/viewed-account-context";
import { TransactionJournalForm } from "@/components/accounts/transactions/transaction-journal-form";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const actions = vi.hoisted(() => ({
  getTransactionJournalEntry: vi.fn(),
  saveTransactionJournalEntry: vi.fn(),
}));

vi.mock("@/components/accounts/transactions/actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TRANSACTION = {
  id: "trade-1",
  executedAt: "2026-01-01T00:00:00.000Z",
  accountLabel: "Kraken",
  legs: [],
} as unknown as InvestmentTransactionListItem;

function renderForm(canWrite: boolean) {
  return render(
    <ViewedAccountProvider
      capabilities={{ canWrite, canRefresh: true, canManageConnections: false }}
    >
      <TransactionJournalForm transaction={TRANSACTION} onBack={() => {}} />
    </ViewedAccountProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.getTransactionJournalEntry.mockResolvedValue({
    entry: null,
    error: null,
  });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ images: [], limits: { count: 4 } }),
    }),
  ) as unknown as typeof fetch;
});

afterEach(cleanup);

/** A member looking at the other granted account (ADR 0005). */
describe("TransactionJournalForm on a read-only account", () => {
  it("shows the entry's prose without letting it be edited", async () => {
    renderForm(false);
    await waitFor(() =>
      expect(actions.getTransactionJournalEntry).toHaveBeenCalled(),
    );

    const note = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(note.readOnly).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Panicked" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("offers no screenshot upload", async () => {
    renderForm(false);
    await waitFor(() =>
      expect(actions.getTransactionJournalEntry).toHaveBeenCalled(),
    );

    expect(screen.queryByRole("button", { name: "Add screenshots" })).toBeNull();
  });
});

describe("TransactionJournalForm on a writable account", () => {
  it("offers the editing controls", async () => {
    renderForm(true);
    await waitFor(() =>
      expect(actions.getTransactionJournalEntry).toHaveBeenCalled(),
    );

    const note = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    await waitFor(() => expect(note.readOnly).toBe(false));
    expect(screen.getByRole("button", { name: "Add screenshots" })).toBeTruthy();
  });
});
