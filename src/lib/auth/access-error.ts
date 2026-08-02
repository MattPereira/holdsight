import "server-only";

import { APIError } from "better-auth";

export const EMAIL_NOT_ALLOWED = "EMAIL_NOT_ALLOWED";

export function emailNotAllowedError(): APIError {
  // Better Auth's first-time OAuth path converts `error.message` into the
  // redirect code, so keep the message machine-readable. Human-facing copy
  // belongs on our auth error page.
  return APIError.from("FORBIDDEN", {
    message: EMAIL_NOT_ALLOWED,
    code: EMAIL_NOT_ALLOWED,
  });
}
