import "server-only";

const ALLOWED_EMAILS_ENV = "ALLOWED_EMAILS";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAllowedEmails(raw: string | undefined): ReadonlySet<string> {
  const emails = new Set(
    (raw ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );

  if (emails.size === 0) {
    throw new Error(
      `${ALLOWED_EMAILS_ENV} must contain at least one approved email address.`,
    );
  }

  return emails;
}

export function isEmailAllowed(
  email: string,
  allowedEmails: ReadonlySet<string>,
): boolean {
  return allowedEmails.has(normalizeEmail(email));
}
