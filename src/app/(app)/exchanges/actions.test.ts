import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizedViewedAccountId =
  vi.fn<(action: string) => Promise<string | null>>();

const accounts = vi.hoisted(() => ({
  ensureUserKrakenAccount: vi.fn(),
  getUserKrakenAccounts: vi.fn(),
}));
const balances = vi.hoisted(() => ({
  getCurrentUserKrakenBalances: vi.fn(),
  syncKrakenAccounts: vi.fn(),
}));
const transactions = vi.hoisted(() => ({
  getCurrentKrakenTransactions: vi.fn(),
  getKrakenTransactionHistoryStatus: vi.fn(),
}));
const ingestion = vi.hoisted(() => ({
  claimInvestmentTransactionSyncLease: vi.fn(),
  releaseInvestmentTransactionSyncLease: vi.fn(),
}));
const workflow = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/authorize", () => ({
  authorizedViewedAccountId: (action: string) =>
    authorizedViewedAccountId(action),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/lib/exchange/kraken/accounts", () => accounts);
vi.mock("@/lib/exchange/kraken/balances", () => balances);
vi.mock("@/lib/exchange/kraken/transactions", () => transactions);
vi.mock("@/lib/investment-transactions/ingestion", () => ingestion);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("workflow/api", () => workflow);
vi.mock("@/workflows/kraken-transaction-sync", () => ({
  syncKrakenTransactionHistory: "kraken-sync-workflow",
}));

const { loadKrakenBalances, loadKrakenTransactions } = await import(
  "@/app/(app)/exchanges/actions"
);

beforeEach(() => {
  vi.clearAllMocks();
  accounts.ensureUserKrakenAccount.mockResolvedValue([{ id: "account-1" }]);
  accounts.getUserKrakenAccounts.mockResolvedValue([{ id: "account-1" }]);
  balances.getCurrentUserKrakenBalances.mockResolvedValue([]);
  transactions.getCurrentKrakenTransactions.mockResolvedValue([]);
  transactions.getKrakenTransactionHistoryStatus.mockResolvedValue({
    earliestTransactionAt: null,
    latestTransactionAt: null,
    hasMore: false,
    phase: "up_to_date",
  });
  ingestion.claimInvestmentTransactionSyncLease.mockResolvedValue(true);
});

// Refresh is the one thing a member may do to the other account: bringing what
// is on screen up to date only re-reads what the provider already holds, so it
// asks the policy for "refresh" rather than write authority (ADR 0005).
describe("refreshing the viewed account", () => {
  beforeEach(() => {
    authorizedViewedAccountId.mockResolvedValue("admin");
  });

  it("refreshes balances for the account on screen", async () => {
    await loadKrakenBalances();

    expect(authorizedViewedAccountId).toHaveBeenCalledWith("refresh");
    expect(balances.syncKrakenAccounts).toHaveBeenCalledWith("admin", [
      { id: "account-1" },
    ]);
  });

  it("starts a Transaction History Sync for the account on screen", async () => {
    const result = await loadKrakenTransactions();

    expect(authorizedViewedAccountId).toHaveBeenCalledWith("refresh");
    expect(workflow.start).toHaveBeenCalledWith("kraken-sync-workflow", [
      "admin",
      "account-1",
      expect.any(String),
    ]);
    expect(result.error).toBeNull();
  });
});

describe("refreshing without a session", () => {
  it("starts nothing", async () => {
    authorizedViewedAccountId.mockResolvedValue(null);

    const result = await loadKrakenTransactions();

    expect(workflow.start).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});
