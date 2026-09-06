import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewedAccountAuthorization } from "@/lib/auth/authorize";

const authorizeViewedAccount =
  vi.fn<() => Promise<ViewedAccountAuthorization>>();
const authorizedViewedAccountId = vi.fn<() => Promise<string | null>>();
const journal = vi.hoisted(() => ({
  getUserInvestmentTransactionJournalEntry: vi.fn(),
  removeUserInvestmentTransactionJournalEntry: vi.fn(),
  saveUserInvestmentTransactionJournalEntry: vi.fn(),
  serializeTradeJournalEntry: vi.fn((entry: unknown) => entry),
}));

vi.mock("@/lib/auth/authorize", () => ({
  authorizeViewedAccount: () => authorizeViewedAccount(),
  authorizedViewedAccountId: () => authorizedViewedAccountId(),
}));
vi.mock("@/lib/journal/transaction-entry", () => journal);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  getTransactionJournalEntry,
  removeTransactionJournalEntry,
  saveTransactionJournalEntry,
} = await import("@/components/accounts/transactions/actions");

const INPUT = {
  note: "",
  tradeReason: null,
  emotions: [],
  marketBias: null,
} as unknown as Parameters<typeof saveTransactionJournalEntry>[1];

beforeEach(() => {
  vi.clearAllMocks();
  journal.getUserInvestmentTransactionJournalEntry.mockResolvedValue(null);
  journal.saveUserInvestmentTransactionJournalEntry.mockResolvedValue({
    status: "saved",
    entry: null,
  });
});

describe("Trade Journal Entry writes against a foreign account", () => {
  // A refused write never returns: the seam answers 403 via `forbidden()`.
  beforeEach(() => {
    authorizedViewedAccountId.mockRejectedValue(new Error("FORBIDDEN"));
  });

  it("refuses to save without falling back to the actor's account", async () => {
    await expect(
      saveTransactionJournalEntry("trade-1", INPUT, null),
    ).rejects.toThrow("FORBIDDEN");

    expect(
      journal.saveUserInvestmentTransactionJournalEntry,
    ).not.toHaveBeenCalled();
  });

  it("refuses to delete", async () => {
    await expect(removeTransactionJournalEntry("trade-1")).rejects.toThrow(
      "FORBIDDEN",
    );

    expect(
      journal.removeUserInvestmentTransactionJournalEntry,
    ).not.toHaveBeenCalled();
  });

  // Reading the account being viewed stays open to every granted user.
  it("still reads the viewed account's entry", async () => {
    authorizeViewedAccount.mockResolvedValue({
      status: "authorized",
      userId: "admin",
    });

    const result = await getTransactionJournalEntry("trade-1");

    expect(
      journal.getUserInvestmentTransactionJournalEntry,
    ).toHaveBeenCalledWith("admin", "trade-1");
    expect(result.error).toBeNull();
  });
});

describe("Trade Journal Entry writes the policy allows", () => {
  beforeEach(() => {
    authorizedViewedAccountId.mockResolvedValue("member");
  });

  it("saves against the viewed account", async () => {
    const result = await saveTransactionJournalEntry("trade-1", INPUT, null);

    expect(
      journal.saveUserInvestmentTransactionJournalEntry,
    ).toHaveBeenCalledWith("member", "trade-1", INPUT, null, false);
    expect(result.status).toBe("saved");
  });

  it("deletes against the viewed account", async () => {
    await removeTransactionJournalEntry("trade-1");

    expect(
      journal.removeUserInvestmentTransactionJournalEntry,
    ).toHaveBeenCalledWith("member", "trade-1");
  });
});

describe("Trade Journal Entry writes without a session", () => {
  it("refuses to save", async () => {
    authorizedViewedAccountId.mockResolvedValue(null);

    const result = await saveTransactionJournalEntry("trade-1", INPUT, null);

    expect(
      journal.saveUserInvestmentTransactionJournalEntry,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
  });
});
