import { describe, expect, it, vi } from "vitest";

import type { TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type { BalancesResult } from "@/lib/portfolio/types";

import { createPortfolioProviderRegistry } from "./create-registry";
import type {
  PortfolioProviderAdapter,
  ProviderTransactionStatus,
} from "./types";

const USER = "user-1";

function balances(address: string): BalancesResult {
  return { status: "ready", address, balances: [] };
}

function tx(executedAt: string, id: string): InvestmentTransactionListItem {
  return { id, executedAt } as InvestmentTransactionListItem;
}

function status(
  overrides: Partial<ProviderTransactionStatus> = {},
): ProviderTransactionStatus {
  return {
    phase: "up_to_date",
    hasMore: false,
    latestTransactionUpdatedAt: null,
    ...overrides,
  };
}

type FakeAdapterOptions = {
  id: string;
  balances?: BalancesResult[];
  transactions?: InvestmentTransactionListItem[];
  status?: ProviderTransactionStatus;
  onRefresh?: () => void;
};

function fakeAdapter(options: FakeAdapterOptions): PortfolioProviderAdapter {
  return {
    id: options.id,
    getAccounts: vi.fn(async () => []),
    getBalances: vi.fn(async () => options.balances ?? []),
    refreshBalances: vi.fn(async () => {
      options.onRefresh?.();
    }),
    getTransactions: vi.fn(async () => options.transactions ?? []),
    getTransactionStatus: vi.fn(async () => options.status ?? status()),
  };
}

function build(adapters: PortfolioProviderAdapter[], overrides: {
  revalidate?: () => void;
  decorateTransactions?: (
    userId: string,
    transactions: InvestmentTransactionListItem[],
  ) => Promise<InvestmentTransactionListItem[]>;
} = {}) {
  return createPortfolioProviderRegistry({
    adapters,
    walletAdapter: adapters[0],
    revalidate: overrides.revalidate ?? vi.fn(),
    decorateTransactions:
      overrides.decorateTransactions ??
      (async (_userId, transactions) => transactions),
  });
}

describe("refreshAll", () => {
  it("refreshes every adapter and revalidates afterwards", async () => {
    const events: string[] = [];
    const wallet = fakeAdapter({
      id: "wallet",
      onRefresh: () => events.push("wallet"),
    });
    const kraken = fakeAdapter({
      id: "kraken",
      onRefresh: () => events.push("kraken"),
    });
    const brokerage = fakeAdapter({
      id: "brokerage",
      onRefresh: () => events.push("brokerage"),
    });
    const revalidate = vi.fn(() => events.push("revalidate"));

    const registry = build([wallet, kraken, brokerage], { revalidate });
    await registry.refreshAll(USER);

    expect(wallet.refreshBalances).toHaveBeenCalledWith(USER);
    expect(kraken.refreshBalances).toHaveBeenCalledWith(USER);
    expect(brokerage.refreshBalances).toHaveBeenCalledWith(USER);
    // Revalidation is part of refreshAll's own contract, and only after every
    // adapter has finished refreshing.
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(events).toContain("revalidate");
    expect(events.at(-1)).toBe("revalidate");
    expect(events.slice(0, 3).sort()).toEqual([
      "brokerage",
      "kraken",
      "wallet",
    ]);
  });
});

describe("getPortfolioBalances", () => {
  it("flattens every adapter's balances in adapter order", async () => {
    const wallet = fakeAdapter({ id: "wallet", balances: [balances("0xabc")] });
    const kraken = fakeAdapter({ id: "kraken", balances: [balances("Kraken")] });
    const brokerage = fakeAdapter({
      id: "brokerage",
      balances: [balances("Fidelity")],
    });

    const registry = build([wallet, kraken, brokerage]);
    const result = await registry.getPortfolioBalances(USER);

    expect(result.map((r) => r.address)).toEqual([
      "0xabc",
      "Kraken",
      "Fidelity",
    ]);
  });
});

describe("getWalletBalances", () => {
  it("returns only the wallet adapter's balances", async () => {
    const wallet = fakeAdapter({ id: "wallet", balances: [balances("0xabc")] });
    const kraken = fakeAdapter({ id: "kraken", balances: [balances("Kraken")] });

    const registry = build([wallet, kraken]);
    const result = await registry.getWalletBalances(USER);

    expect(result.map((r) => r.address)).toEqual(["0xabc"]);
    expect(kraken.getBalances).not.toHaveBeenCalled();
  });
});

describe("getPortfolioTransactions", () => {
  it("merges and sorts every adapter's transactions newest-first", async () => {
    const wallet = fakeAdapter({
      id: "wallet",
      transactions: [tx("2026-01-02T00:00:00Z", "w1")],
    });
    const kraken = fakeAdapter({
      id: "kraken",
      transactions: [tx("2026-01-05T00:00:00Z", "k1")],
    });
    const brokerage = fakeAdapter({
      id: "brokerage",
      transactions: [tx("2026-01-03T00:00:00Z", "b1")],
    });

    const registry = build([wallet, kraken, brokerage]);
    const snapshot = await registry.getPortfolioTransactions(USER);

    expect(snapshot.transactions.map((t) => t.id)).toEqual(["k1", "b1", "w1"]);
    expect(snapshot.historyStatus.latestTransactionAt).toBe(
      "2026-01-05T00:00:00Z",
    );
    expect(snapshot.historyStatus.earliestTransactionAt).toBe(
      "2026-01-02T00:00:00Z",
    );
  });

  it("reports hasMore when any adapter has more history", async () => {
    const wallet = fakeAdapter({ id: "wallet", status: status() });
    const kraken = fakeAdapter({
      id: "kraken",
      status: status({ hasMore: true }),
    });

    const registry = build([wallet, kraken]);
    const snapshot = await registry.getPortfolioTransactions(USER);

    expect(snapshot.historyStatus.hasMore).toBe(true);
    expect(snapshot.isSyncing).toBe(true);
  });

  it("reconciles to the least-complete phase across adapters", async () => {
    const cases: [TransactionSyncPhase[], TransactionSyncPhase][] = [
      [["up_to_date", "up_to_date"], "up_to_date"],
      [["up_to_date", "catching_up"], "catching_up"],
      [["catching_up", "backfilling"], "backfilling"],
      [["up_to_date", "backfilling"], "backfilling"],
    ];

    for (const [phases, expected] of cases) {
      const adapters = phases.map((phase, index) =>
        fakeAdapter({ id: `p${index}`, status: status({ phase }) }),
      );
      const registry = build(adapters);
      const snapshot = await registry.getPortfolioTransactions(USER);
      expect(snapshot.historyStatus.phase).toBe(expected);
    }
  });

  it("surfaces the most recent latestTransactionUpdatedAt reported", async () => {
    const wallet = fakeAdapter({
      id: "wallet",
      status: status({ latestTransactionUpdatedAt: "2026-01-04T00:00:00Z" }),
    });
    const kraken = fakeAdapter({
      id: "kraken",
      status: status({ latestTransactionUpdatedAt: null }),
    });
    const brokerage = fakeAdapter({
      id: "brokerage",
      status: status({ latestTransactionUpdatedAt: "2026-01-06T00:00:00Z" }),
    });

    const registry = build([wallet, kraken, brokerage]);
    const snapshot = await registry.getPortfolioTransactions(USER);

    expect(snapshot.historyStatus.latestTransactionUpdatedAt).toBe(
      "2026-01-06T00:00:00Z",
    );
  });

  it("applies the transaction decorator to the merged feed", async () => {
    const wallet = fakeAdapter({
      id: "wallet",
      transactions: [tx("2026-01-02T00:00:00Z", "w1")],
    });
    const decorateTransactions = vi.fn(
      async (_userId: string, transactions: InvestmentTransactionListItem[]) =>
        transactions.map((t) => ({ ...t, id: `${t.id}-decorated` })),
    );

    const registry = build([wallet], { decorateTransactions });
    const snapshot = await registry.getPortfolioTransactions(USER);

    expect(decorateTransactions).toHaveBeenCalledWith(USER, [
      tx("2026-01-02T00:00:00Z", "w1"),
    ]);
    expect(snapshot.transactions[0].id).toBe("w1-decorated");
  });
});

describe("getWalletTransactions", () => {
  it("uses only the wallet adapter's transactions and status", async () => {
    const wallet = fakeAdapter({
      id: "wallet",
      transactions: [tx("2026-01-02T00:00:00Z", "w1")],
      status: status({ hasMore: true, phase: "backfilling" }),
    });
    const kraken = fakeAdapter({
      id: "kraken",
      transactions: [tx("2026-01-09T00:00:00Z", "k1")],
      status: status({ hasMore: true }),
    });

    const registry = build([wallet, kraken]);
    const snapshot = await registry.getWalletTransactions(USER);

    expect(snapshot.transactions.map((t) => t.id)).toEqual(["w1"]);
    expect(snapshot.historyStatus.phase).toBe("backfilling");
    expect(kraken.getTransactions).not.toHaveBeenCalled();
    expect(kraken.getTransactionStatus).not.toHaveBeenCalled();
  });
});

describe("getTransactionsInRange", () => {
  it("passes the range to every adapter and merges the results", async () => {
    const range = { start: new Date("2026-01-01"), end: new Date("2026-02-01") };
    const wallet = fakeAdapter({
      id: "wallet",
      transactions: [tx("2026-01-02T00:00:00Z", "w1")],
    });
    const kraken = fakeAdapter({
      id: "kraken",
      transactions: [tx("2026-01-08T00:00:00Z", "k1")],
    });

    const registry = build([wallet, kraken]);
    const result = await registry.getTransactionsInRange(USER, range);

    expect(wallet.getTransactions).toHaveBeenCalledWith(USER, range);
    expect(kraken.getTransactions).toHaveBeenCalledWith(USER, range);
    expect(result.map((t) => t.id)).toEqual(["k1", "w1"]);
  });
});
