import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32; // AES-256 requires a 32-byte key.

function encryptionKeyFromEnv(envName: string): Buffer {
  const raw = process.env[envName];
  if (!raw) {
    throw new Error(`${envName} is not set`);
  }

  // Accept a 64-char hex string or a 44-char base64 string (both 32 bytes).
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${envName} must decode to ${KEY_LENGTH} bytes (got ${key.length})`,
    );
  }

  return key;
}

export function encryptWithEnvKey(plaintext: string, envName: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKeyFromEnv(envName), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptWithEnvKey(payload: string, envName: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKeyFromEnv(envName),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
