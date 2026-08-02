import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/lib/auth/error-message";

describe("authErrorMessage", () => {
  it("explains an allowlist rejection without revealing the allowlist", () => {
    expect(authErrorMessage("EMAIL_NOT_ALLOWED")).toEqual({
      title: "Access denied",
      description:
        "This email isn’t approved for this Holdsight instance. Contact the instance owner or sign in with another account.",
    });
  });

  it("does not expose unknown provider error details", () => {
    expect(authErrorMessage("unexpected_provider_error")).toEqual({
      title: "Sign-in failed",
      description: "We couldn’t sign you in. Please try again.",
    });
  });
});
