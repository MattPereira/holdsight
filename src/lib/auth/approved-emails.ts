import "server-only";

import { parseAllowedEmails } from "@/lib/auth/allowed-emails";

// Parsed once, at import, so a deployment with a missing or empty allowlist
// fails to boot rather than serving a request it cannot safely answer.
export const approvedEmails = parseAllowedEmails(process.env.ALLOWED_EMAILS);
