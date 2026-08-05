import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  getSchwabConfig: () => ({
    accountsUrl: "https://schwab.test/accounts",
    accountNumbersUrl: "https://schwab.test/accounts/accountNumbers",
    userPreferenceUrl: "https://schwab.test/user-preference",
  }),
  SCHWAB_BROKERAGE_PROVIDER: "schwab",
}));

import { getSchwabHoldings } from "./client";

const ACCOUNT_NUMBER = "123456789";
const HASH_VALUE = "A1B2C3D4E5F6";

/**
 * `getSchwabHoldings` fetches accounts, then user preferences and account
 * hashes in parallel — in that request order.
 */
function mockSchwabResponses({
  accountNumbers,
}: {
  accountNumbers: unknown[];
}): void {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            securitiesAccount: {
              accountNumber: ACCOUNT_NUMBER,
              currentBalances: { cashBalance: 42 },
            },
          },
        ]),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify(accountNumbers), { status: 200 }),
    );
}

describe("getSchwabHoldings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an opaque source ID for cash balances", async () => {
    mockSchwabResponses({
      accountNumbers: [
        { accountNumber: ACCOUNT_NUMBER, hashValue: HASH_VALUE },
      ],
    });

    const result = await getSchwabHoldings("access-token");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.accounts[0]?.balances).toEqual([
      expect.objectContaining({
        sourceBalanceId: "schwab:cash",
        symbol: "USD",
      }),
    ]);
    expect(result.accounts[0]?.balances[0]?.sourceBalanceId).not.toContain(
      ACCOUNT_NUMBER,
    );
  });

  it("identifies accounts by hash value, never the account number", async () => {
    mockSchwabResponses({
      accountNumbers: [
        { accountNumber: ACCOUNT_NUMBER, hashValue: HASH_VALUE },
      ],
    });

    const result = await getSchwabHoldings("access-token");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.accounts[0]?.externalAccountId).toBe(HASH_VALUE);
    // The last four digits stay available for display.
    expect(result.accounts[0]?.mask).toBe("6789");
  });

  it("drops accounts with no hash rather than storing the account number", async () => {
    mockSchwabResponses({ accountNumbers: [] });

    const result = await getSchwabHoldings("access-token");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.accounts).toEqual([]);
  });
});
