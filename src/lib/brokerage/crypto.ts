import "server-only";

import {
  decryptWithEnvKey,
  encryptWithEnvKey,
} from "@/lib/security/encryption";

const BROKERAGE_TOKEN_ENCRYPTION_KEY = "BROKERAGE_TOKEN_ENCRYPTION_KEY";

export function encryptBrokerageToken(plaintext: string, userId: string): string {
  return encryptWithEnvKey(plaintext, BROKERAGE_TOKEN_ENCRYPTION_KEY, userId);
}

export function decryptBrokerageToken(payload: string, userId: string): string {
  return decryptWithEnvKey(payload, BROKERAGE_TOKEN_ENCRYPTION_KEY, userId);
}
