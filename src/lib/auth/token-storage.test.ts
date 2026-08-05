import { describe, expect, it } from "vitest";

import { withoutPersistedIdToken } from "@/lib/auth/token-storage";

describe("OAuth token storage", () => {
  it("removes ID tokens while preserving other account fields", () => {
    expect(
      withoutPersistedIdToken({
        providerId: "google",
        idToken: "plaintext-id-token",
        accessToken: "encrypted-access-token",
      }),
    ).toEqual({
      providerId: "google",
      idToken: null,
      accessToken: "encrypted-access-token",
    });
  });
});
