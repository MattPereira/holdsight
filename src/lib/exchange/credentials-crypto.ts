import "server-only";

import {
  decryptWithEnvKey,
  encryptWithEnvKey,
} from "@/lib/security/encryption";

const EXCHANGE_CREDENTIAL_ENCRYPTION_KEY =
  "EXCHANGE_CREDENTIAL_ENCRYPTION_KEY";

export type ExchangeApiCredentials = {
  apiKey: string;
  apiSecret: string;
};

function isExchangeApiCredentials(
  value: unknown,
): value is ExchangeApiCredentials {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.apiKey === "string" &&
    record.apiKey.length > 0 &&
    typeof record.apiSecret === "string" &&
    record.apiSecret.length > 0
  );
}

export function encryptExchangeApiCredentials(
  credentials: ExchangeApiCredentials,
  userId: string,
): string {
  return encryptWithEnvKey(
    JSON.stringify(credentials),
    EXCHANGE_CREDENTIAL_ENCRYPTION_KEY,
    userId,
  );
}

export function decryptExchangeApiCredentials(
  payload: string,
  userId: string,
): ExchangeApiCredentials {
  const decrypted = JSON.parse(
    decryptWithEnvKey(payload, EXCHANGE_CREDENTIAL_ENCRYPTION_KEY, userId),
  ) as unknown;

  if (!isExchangeApiCredentials(decrypted)) {
    throw new Error("Malformed exchange API credentials");
  }

  return decrypted;
}
