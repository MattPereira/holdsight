import "server-only";

import { APIError } from "better-auth";

import { EMAIL_NOT_ALLOWED } from "@/lib/auth/access-error-code";

export function emailNotAllowedError(): APIError {
  // Better Auth's first-time OAuth path converts `error.message` into the
  // redirect code, so keep the message machine-readable. Human-facing copy
  // belongs on our auth error page.
  return APIError.from("FORBIDDEN", {
    message: EMAIL_NOT_ALLOWED,
    code: EMAIL_NOT_ALLOWED,
  });
}
