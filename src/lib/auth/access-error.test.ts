import { describe, expect, it } from "vitest";

import { emailNotAllowedError } from "@/lib/auth/access-error";
import { authErrorMessage } from "@/lib/auth/error-message";

describe("emailNotAllowedError", () => {
  it("survives Better Auth's OAuth error-message conversion", () => {
    const redirectCode = emailNotAllowedError().message
      .split(" ")
      .join("_");

    expect(redirectCode).toBe("EMAIL_NOT_ALLOWED");
    expect(authErrorMessage(redirectCode).title).toBe("Access denied");
  });
});
