import "server-only";

import {
  decryptWithEnvKey,
  encryptWithEnvKey,
} from "@/lib/security/encryption";

// Reuse the existing token-at-rest key so adding brokerage providers does not
// require a new deployment secret. The env name is historical from the first
// token source, but the key protects all brokerage provider tokens.
const BROKERAGE_TOKEN_ENCRYPTION_KEY = "PLAID_TOKEN_ENCRYPTION_KEY";

export function encryptBrokerageToken(plaintext: string): string {
  return encryptWithEnvKey(plaintext, BROKERAGE_TOKEN_ENCRYPTION_KEY);
}

export function decryptBrokerageToken(payload: string): string {
  return decryptWithEnvKey(payload, BROKERAGE_TOKEN_ENCRYPTION_KEY);
}
