import "server-only";

import {
  decryptWithEnvKey,
  encryptWithEnvKey,
} from "@/lib/security/encryption";

// AES-256-GCM at-rest encryption for Plaid access tokens. The ciphertext is
// what we store in plaid_items.access_token_encrypted; the plaintext token
// only ever exists in memory for the duration of a single Plaid API call.
//
// Format: base64(iv).base64(authTag).base64(ciphertext)
// - iv (12 bytes): unique per encryption, prepended so we can decrypt later.
// - authTag (16 bytes): GCM integrity tag; decryption fails if data is tampered.

const PLAID_TOKEN_ENCRYPTION_KEY = "PLAID_TOKEN_ENCRYPTION_KEY";

export function encrypt(plaintext: string): string {
  return encryptWithEnvKey(plaintext, PLAID_TOKEN_ENCRYPTION_KEY);
}

export function decrypt(payload: string): string {
  return decryptWithEnvKey(payload, PLAID_TOKEN_ENCRYPTION_KEY);
}
