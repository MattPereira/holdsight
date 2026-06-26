import "server-only";

import { createHash, randomBytes } from "crypto";

import { db } from "@/db";
import { brokerageConnections } from "@/db/schema/investment-accounts";
import { encryptBrokerageToken } from "@/lib/brokerage/crypto";
import {
  getSchwabConfig,
  SCHWAB_BROKERAGE_PROVIDER,
  type SchwabConfig,
} from "@/lib/brokerage/providers/schwab/config";

const SCHWAB_CONNECTION_EXTERNAL_ID = "default";

export type SchwabTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
  refresh_token_expires_in?: number;
};

type SchwabTokenError = {
  error?: string;
  error_description?: string;
  message?: string;
};

export function createSchwabOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildSchwabAuthorizationUrl(state: string): URL {
  const config = getSchwabConfig();
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (config.scope) url.searchParams.set("scope", config.scope);
  return url;
}

function basicAuth(config: SchwabConfig): string {
  return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    "base64",
  );
}

export function schwabTokenExpiresAt(
  expiresInSeconds: number | undefined,
): Date | null {
  if (!expiresInSeconds || expiresInSeconds <= 0) return null;
  return new Date(Date.now() + expiresInSeconds * 1000);
}

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

async function readTokenResponse(response: Response): Promise<SchwabTokenResponse> {
  const body = (await response.json().catch(() => null)) as
    | SchwabTokenResponse
    | SchwabTokenError
    | null;

  if (!response.ok) {
    const message =
      body && "error_description" in body && body.error_description
        ? body.error_description
        : body && "message" in body && body.message
          ? body.message
          : body && "error" in body && body.error
            ? body.error
            : "Schwab token exchange failed.";
    throw new Error(message);
  }

  if (!body || !("access_token" in body) || !body.access_token) {
    throw new Error("Schwab token response did not include an access token.");
  }

  return body;
}

export async function exchangeSchwabAuthorizationCode(
  code: string,
): Promise<SchwabTokenResponse> {
  const config = getSchwabConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(config)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return readTokenResponse(response);
}

export async function refreshSchwabAccessToken(
  refreshToken: string,
): Promise<SchwabTokenResponse> {
  const config = getSchwabConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(config)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return readTokenResponse(response);
}

export async function saveSchwabOAuthConnection(input: {
  userId: string;
  tokens: SchwabTokenResponse;
}): Promise<string> {
  const refreshTokenEncrypted = input.tokens.refresh_token
    ? encryptBrokerageToken(input.tokens.refresh_token)
    : null;

  const [connection] = await db
    .insert(brokerageConnections)
    .values({
      userId: input.userId,
      provider: SCHWAB_BROKERAGE_PROVIDER,
      externalConnectionId: SCHWAB_CONNECTION_EXTERNAL_ID,
      accessTokenEncrypted: encryptBrokerageToken(input.tokens.access_token),
      refreshTokenEncrypted,
      tokenExpiresAt: schwabTokenExpiresAt(input.tokens.expires_in),
      institutionName: "Charles Schwab",
      status: "active",
      metadata: {
        tokenType: input.tokens.token_type ?? null,
        scope: input.tokens.scope ?? null,
        accessTokenFingerprint: tokenFingerprint(input.tokens.access_token),
        hasRefreshToken: Boolean(input.tokens.refresh_token),
        refreshTokenExpiresIn: input.tokens.refresh_token_expires_in ?? null,
      },
    })
    .onConflictDoUpdate({
      target: [
        brokerageConnections.userId,
        brokerageConnections.provider,
        brokerageConnections.externalConnectionId,
      ],
      set: {
        accessTokenEncrypted: encryptBrokerageToken(input.tokens.access_token),
        refreshTokenEncrypted,
        tokenExpiresAt: schwabTokenExpiresAt(input.tokens.expires_in),
        institutionName: "Charles Schwab",
        status: "active",
        metadata: {
          tokenType: input.tokens.token_type ?? null,
          scope: input.tokens.scope ?? null,
          accessTokenFingerprint: tokenFingerprint(input.tokens.access_token),
          hasRefreshToken: Boolean(input.tokens.refresh_token),
          refreshTokenExpiresIn: input.tokens.refresh_token_expires_in ?? null,
        },
        updatedAt: new Date(),
      },
    })
    .returning({ id: brokerageConnections.id });

  return connection.id;
}
