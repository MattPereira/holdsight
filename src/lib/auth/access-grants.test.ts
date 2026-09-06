import { describe, expect, it } from "vitest";

import { EMAIL_NOT_ALLOWED } from "@/lib/auth/access-error-code";
import {
  normalizeEmail,
  requireAccessGrant,
  type AccessGrantLookup,
} from "@/lib/auth/access-grants";
import type { AccessRole } from "@/lib/auth/policy";

const grants: Record<string, AccessRole> = {
  "admin@example.com": "admin",
  "member@example.com": "member",
};

const lookup: AccessGrantLookup = async (email) =>
  grants[normalizeEmail(email)] ?? null;

describe("normalizeEmail", () => {
  it.each([
    [" Admin@Example.com ", "admin@example.com"],
    ["MEMBER@EXAMPLE.COM", "member@example.com"],
  ])("normalizes %j", (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });
});

describe("requireAccessGrant", () => {
  it("admits a granted email and reports its role", async () => {
    await expect(requireAccessGrant(lookup, "admin@example.com")).resolves.toBe(
      "admin",
    );
  });

  // A grant may exist before its first sign-in; that is how the instance is
  // bootstrapped, so a pre-granted stranger must be able to enroll.
  it("admits a granted email that has never signed in", async () => {
    await expect(requireAccessGrant(lookup, " Member@Example.COM ")).resolves.toBe(
      "member",
    );
  });

  it.each(["stranger@example.com", "", "admin@example.com.attacker.test"])(
    "rejects the ungranted email %j",
    async (email) => {
      await expect(requireAccessGrant(lookup, email)).rejects.toMatchObject({
        message: EMAIL_NOT_ALLOWED,
      });
    },
  );

  it("rejects an email whose grant was deleted", async () => {
    const revoked: AccessGrantLookup = async () => null;

    await expect(
      requireAccessGrant(revoked, "member@example.com"),
    ).rejects.toMatchObject({ message: EMAIL_NOT_ALLOWED });
  });
});
