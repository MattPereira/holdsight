import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  getSchwabConfig: () => ({
    accountsUrl: "https://schwab.test/accounts",
    userPreferenceUrl: "https://schwab.test/user-preference",
  }),
  SCHWAB_BROKERAGE_PROVIDER: "schwab",
}));

import { getSchwabHoldings } from "./client";

describe("getSchwabHoldings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an opaque source ID for cash balances", async () => {
    const accountNumber = "123456789";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              securitiesAccount: {
                accountNumber,
                currentBalances: { cashBalance: 42 },
              },
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

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
      accountNumber,
    );
  });
});
