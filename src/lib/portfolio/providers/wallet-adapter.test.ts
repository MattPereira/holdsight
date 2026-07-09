import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BalancesResult } from "@/lib/portfolio/types";

vi.mock("@/lib/evm/accounts", () => ({
  getUserEvmAccounts: vi.fn(),
}));
vi.mock("@/lib/evm/balances", () => ({
  getCurrentEvmBalances: vi.fn(),
  syncEvmWalletBalances: vi.fn(),
}));
vi.mock("@/lib/hyper-core/accounts", () => ({
  ensureUserHyperCoreAccounts: vi.fn(),
  getUserHyperCoreAccounts: vi.fn(),
}));
vi.mock("@/lib/hyper-core/balances", () => ({
  getCurrentHyperCoreBalances: vi.fn(),
  syncHyperCoreAccounts: vi.fn(),
}));
vi.mock("@/lib/lighter/accounts", () => ({
  getUserLighterAccounts: vi.fn(),
}));
vi.mock("@/lib/lighter/balances", () => ({
  getCurrentLighterBalances: vi.fn(),
  syncLighterAccounts: vi.fn(),
}));
vi.mock("@/lib/wallets/transactions", () => ({
  getCurrentWalletTransactions: vi.fn(),
  getWalletTransactionHistoryStatus: vi.fn(),
}));

import { getUserEvmAccounts } from "@/lib/evm/accounts";
import {
  getCurrentEvmBalances,
  syncEvmWalletBalances,
} from "@/lib/evm/balances";
import {
  ensureUserHyperCoreAccounts,
  getUserHyperCoreAccounts,
} from "@/lib/hyper-core/accounts";
import {
  getCurrentHyperCoreBalances,
  syncHyperCoreAccounts,
} from "@/lib/hyper-core/balances";
import { getUserLighterAccounts } from "@/lib/lighter/accounts";
import {
  getCurrentLighterBalances,
  syncLighterAccounts,
} from "@/lib/lighter/balances";
import {
  getCurrentWalletTransactions,
  getWalletTransactionHistoryStatus,
} from "@/lib/wallets/transactions";

import { walletAdapter } from "./wallet-adapter";

const USER = "user-1";
const EVM_ACCOUNTS = [
  { id: "evm-1", address: "0xABC", label: "Main", syncStatus: "success" },
];

const mocks = {
  getUserEvmAccounts: vi.mocked(getUserEvmAccounts),
  getCurrentEvmBalances: vi.mocked(getCurrentEvmBalances),
  syncEvmWalletBalances: vi.mocked(syncEvmWalletBalances),
  ensureUserHyperCoreAccounts: vi.mocked(ensureUserHyperCoreAccounts),
  getUserHyperCoreAccounts: vi.mocked(getUserHyperCoreAccounts),
  getCurrentHyperCoreBalances: vi.mocked(getCurrentHyperCoreBalances),
  syncHyperCoreAccounts: vi.mocked(syncHyperCoreAccounts),
  getUserLighterAccounts: vi.mocked(getUserLighterAccounts),
  getCurrentLighterBalances: vi.mocked(getCurrentLighterBalances),
  syncLighterAccounts: vi.mocked(syncLighterAccounts),
  getCurrentWalletTransactions: vi.mocked(getCurrentWalletTransactions),
  getWalletTransactionHistoryStatus: vi.mocked(
    getWalletTransactionHistoryStatus,
  ),
};

function ready(address: string, ...symbols: string[]): BalancesResult {
  return {
    status: "ready",
    address,
    balances: symbols.map((symbol) => ({
      symbol,
      chainId: "evm",
      amount: 1,
      priceUsd: 1,
      valueUsd: symbols.indexOf(symbol) + 1,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mocks.getUserEvmAccounts.mockResolvedValue(EVM_ACCOUNTS as any);
  mocks.getUserHyperCoreAccounts.mockResolvedValue([]);
  mocks.getUserLighterAccounts.mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mocks.ensureUserHyperCoreAccounts.mockResolvedValue([] as any);
  mocks.getCurrentEvmBalances.mockResolvedValue([]);
  mocks.getCurrentHyperCoreBalances.mockResolvedValue([]);
  mocks.getCurrentLighterBalances.mockResolvedValue([]);
});

describe("refreshBalances", () => {
  it("sequences EVM → HyperCore → Lighter, ensuring HyperCore from wallets", async () => {
    const events: string[] = [];
    mocks.syncEvmWalletBalances.mockImplementation(async () => {
      events.push("evm");
    });
    mocks.ensureUserHyperCoreAccounts.mockImplementation(async () => {
      events.push("ensure-hypercore");
      return [] as never;
    });
    mocks.syncHyperCoreAccounts.mockImplementation(async () => {
      events.push("hypercore");
    });
    mocks.getUserLighterAccounts.mockImplementation(async () => {
      events.push("get-lighter");
      return [];
    });
    mocks.syncLighterAccounts.mockImplementation(async () => {
      events.push("lighter");
    });

    await walletAdapter.refreshBalances(USER);

    expect(events).toEqual([
      "evm",
      "ensure-hypercore",
      "hypercore",
      "get-lighter",
      "lighter",
    ]);
    // HyperCore accounts are ensured (derived) from the EVM wallet addresses.
    expect(mocks.ensureUserHyperCoreAccounts).toHaveBeenCalledWith(
      USER,
      EVM_ACCOUNTS,
    );
    expect(mocks.syncEvmWalletBalances).toHaveBeenCalledWith(EVM_ACCOUNTS);
  });

  it("does nothing when the user has no EVM wallets", async () => {
    mocks.getUserEvmAccounts.mockResolvedValue([]);

    await walletAdapter.refreshBalances(USER);

    expect(mocks.syncEvmWalletBalances).not.toHaveBeenCalled();
    expect(mocks.ensureUserHyperCoreAccounts).not.toHaveBeenCalled();
    expect(mocks.syncLighterAccounts).not.toHaveBeenCalled();
  });
});

describe("getBalances", () => {
  it("ensures HyperCore accounts then merges the three sources by address", async () => {
    mocks.getCurrentEvmBalances.mockResolvedValue([ready("0xABC", "ETH")]);
    mocks.getCurrentHyperCoreBalances.mockResolvedValue([
      ready("0xabc", "HYPE"),
    ]);
    mocks.getCurrentLighterBalances.mockResolvedValue([ready("0xAbC", "USDC")]);

    const result = await walletAdapter.getBalances(USER);

    expect(mocks.ensureUserHyperCoreAccounts).toHaveBeenCalledWith(
      USER,
      EVM_ACCOUNTS,
    );
    // The three same-address results collapse into one merged row.
    expect(result).toHaveLength(1);
    const merged = result[0];
    if (merged.status !== "ready") throw new Error("expected ready result");
    expect(merged.balances.map((b) => b.symbol).sort()).toEqual([
      "ETH",
      "HYPE",
      "USDC",
    ]);
  });

  it("keeps distinct wallet addresses as separate rows", async () => {
    mocks.getCurrentEvmBalances.mockResolvedValue([ready("0xABC", "ETH")]);
    mocks.getCurrentLighterBalances.mockResolvedValue([ready("0xDEF", "USDC")]);

    const result = await walletAdapter.getBalances(USER);

    expect(result.map((r) => r.address).sort()).toEqual(["0xABC", "0xDEF"]);
  });
});

describe("getTransactionStatus", () => {
  it("normalizes the wallet history status onto the provider shape", async () => {
    mocks.getWalletTransactionHistoryStatus.mockResolvedValue({
      transactionCount: 3,
      earliestTransactionAt: null,
      latestTransactionAt: null,
      latestTransactionUpdatedAt: "2026-01-05T00:00:00Z",
      hasMore: true,
      phase: "catching_up",
    });

    const status = await walletAdapter.getTransactionStatus(USER);

    expect(status).toEqual({
      phase: "catching_up",
      hasMore: true,
      latestTransactionUpdatedAt: "2026-01-05T00:00:00Z",
    });
  });
});
