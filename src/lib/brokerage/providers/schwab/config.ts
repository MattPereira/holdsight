import "server-only";

const DEFAULT_AUTHORIZATION_URL =
  "https://api.schwabapi.com/v1/oauth/authorize";
const DEFAULT_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";

export const SCHWAB_BROKERAGE_PROVIDER = "schwab";

export type SchwabConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string | null;
};

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function isSchwabConfigured(): boolean {
  return Boolean(
    (env("SCHWAB_CLIENT_ID") ?? env("SCHWAB_APP_KEY")) &&
      (env("SCHWAB_CLIENT_SECRET") ?? env("SCHWAB_APP_SECRET")) &&
      env("SCHWAB_REDIRECT_URI"),
  );
}

export function getSchwabConfig(): SchwabConfig {
  const clientId = env("SCHWAB_CLIENT_ID") ?? env("SCHWAB_APP_KEY");
  const clientSecret =
    env("SCHWAB_CLIENT_SECRET") ?? env("SCHWAB_APP_SECRET");
  const redirectUri = env("SCHWAB_REDIRECT_URI");

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Schwab is not configured. Set SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, and SCHWAB_REDIRECT_URI.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    authorizationUrl:
      env("SCHWAB_AUTHORIZATION_URL") ?? DEFAULT_AUTHORIZATION_URL,
    tokenUrl: env("SCHWAB_TOKEN_URL") ?? DEFAULT_TOKEN_URL,
    scope: env("SCHWAB_SCOPE"),
  };
}
