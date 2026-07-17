import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useTransactionsPanel,
  type TransactionsSource,
} from "@/components/accounts/transactions/use-transactions-panel";
import type { TransactionsView } from "@/components/accounts/transactions/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

// The hook only reads array length and identity, so opaque rows suffice.
function rows(count: number): InvestmentTransactionListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
  })) as unknown as InvestmentTransactionListItem[];
}

function view(
  transactions: InvestmentTransactionListItem[],
  hasMore: boolean,
): TransactionsView {
  return {
    transactions,
    message: "",
    error: null,
    historyStatus: {
      earliestTransactionAt: null,
      latestTransactionAt: null,
      latestTransactionUpdatedAt: null,
      hasMore,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useTransactionsPanel", () => {
  it("polls an in-progress sync until it reaches a terminal state", async () => {
    vi.useFakeTimers();
    const pollAction = vi.fn(async () => view(rows(2), false));
    const source: TransactionsSource = {
      initial: view(rows(1), true),
      refreshAction: async () => view(rows(1), true),
      pollAction,
    };

    const { result } = renderHook(() => useTransactionsPanel(source));
    expect(result.current?.transactions).toHaveLength(1);

    // One interval tick reaches the terminal snapshot; the count climbs.
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(result.current?.transactions).toHaveLength(2);

    // hasMore is now false, so polling has stopped: further ticks are inert.
    await act(() => vi.advanceTimersByTimeAsync(8000));
    expect(pollAction).toHaveBeenCalledTimes(1);
  });

  it("surfaces a poll failure and pauses polling", async () => {
    vi.useFakeTimers();
    const pollAction = vi.fn(async () => {
      throw new Error("sync check failed");
    });
    const source: TransactionsSource = {
      initial: view(rows(1), true),
      refreshAction: async () => view(rows(1), true),
      pollAction,
    };

    const { result } = renderHook(() => useTransactionsPanel(source));

    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(result.current?.error).toBe("sync check failed");

    // An error pauses the loop so control returns to the user.
    await act(() => vi.advanceTimersByTimeAsync(8000));
    expect(pollAction).toHaveBeenCalledTimes(1);
  });
});
