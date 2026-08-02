import { describe, expect, it } from "vitest";

import { isEmailAllowed, parseAllowedEmails } from "@/lib/auth/allowed-emails";

describe("allowed emails", () => {
  it.each([undefined, "", " , "])("defaults deny for %j", (raw) => {
    expect(() => parseAllowedEmails(raw)).toThrow(
      "ALLOWED_EMAILS must contain at least one approved email address.",
    );
  });

  it("normalizes, trims, and deduplicates configured emails", () => {
    const emails = parseAllowedEmails(
      " Matt@Example.com,partner@example.com, matt@example.com ",
    );

    expect([...emails]).toEqual(["matt@example.com", "partner@example.com"]);
  });

  it("matches approved emails case-insensitively", () => {
    const emails = parseAllowedEmails("matt@example.com");

    expect(isEmailAllowed(" MATT@example.com ", emails)).toBe(true);
    expect(isEmailAllowed("attacker@example.com", emails)).toBe(false);
  });
});
