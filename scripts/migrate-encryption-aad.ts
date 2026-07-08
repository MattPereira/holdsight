// One-time migration: re-encrypts every row produced by the pre-AAD
// encryption scheme so it carries a per-row AAD (the owning user id) and,
// for Schwab tokens, moves them off the shared Plaid key onto their own key.
//
// Background: src/lib/security/encryption.ts now binds ciphertext to a
// `context` string via GCM's AAD, and src/lib/brokerage/crypto.ts now uses
// BROKERAGE_TOKEN_ENCRYPTION_KEY instead of PLAID_TOKEN_ENCRYPTION_KEY. Rows
// written before that change have neither, so decrypting them with the new
// code throws an auth-tag failure. This script decrypts old-style ciphertext
// and re-encrypts it in the new format, in place.
//
// Safe to re-run: each row is checked against the NEW format first, and left
// untouched if it already decrypts under it.
//
// Usage:
//   pnpm dlx tsx scripts/migrate-encryption-aad.ts            # dry run, no writes
//   pnpm dlx tsx scripts/migrate-encryption-aad.ts --apply    # writes changes
//
// Before running with --apply: back up the database (e.g. a Neon branch)
// and set BROKERAGE_TOKEN_ENCRYPTION_KEY in the environment to a NEW 32-byte
// key (openssl rand -hex 32), distinct from PLAID_TOKEN_ENCRYPTION_KEY.

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq } from "drizzle-orm";
import ws from "ws";

import {
  brokerageConnections,
  exchangeApiCredentials,
  lighterCredentials,
  plaidItems,
} from "../src/db/schema/investment-accounts";

const APPLY = process.argv.includes("--apply");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function keyFromEnv(envName: string): Buffer {
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set`);
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

function legacyDecrypt(payload: string, envName: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFromEnv(envName),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptWithAad(plaintext: string, envName: string, aad: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFromEnv(envName), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
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

function decryptWithAad(payload: string, envName: string, aad: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFromEnv(envName),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function isAlreadyMigrated(payload: string, envName: string, aad: string): boolean {
  try {
    decryptWithAad(payload, envName, aad);
    return true;
  } catch {
    return false;
  }
}

type MigrateResult =
  | { status: "already" }
  | { status: "migrated"; newPayload: string }
  | { status: "failed"; error: string };

function migrateValue(
  payload: string,
  legacyKeyName: string,
  newKeyName: string,
  aad: string,
): MigrateResult {
  if (isAlreadyMigrated(payload, newKeyName, aad)) {
    return { status: "already" };
  }
  try {
    const plaintext = legacyDecrypt(payload, legacyKeyName);
    return { status: "migrated", newPayload: encryptWithAad(plaintext, newKeyName, aad) };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

type Counts = { total: number; already: number; migrated: number; failed: number };

function newCounts(): Counts {
  return { total: 0, already: 0, migrated: 0, failed: 0 };
}

function report(label: string, counts: Counts, failures: string[]) {
  console.log(
    `${label}: total=${counts.total} already=${counts.already} migrated=${counts.migrated} failed=${counts.failed}`,
  );
  for (const f of failures) console.log(`  FAILED: ${f}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool });

  console.log(APPLY ? "Running with --apply (writes enabled)" : "Dry run (no writes; pass --apply to write)");

  // --- plaid_items.access_token_encrypted: same key, add AAD=userId ---
  {
    const counts = newCounts();
    const failures: string[] = [];
    const rows = await db
      .select({ id: plaidItems.id, userId: plaidItems.userId, itemId: plaidItems.itemId, accessTokenEncrypted: plaidItems.accessTokenEncrypted })
      .from(plaidItems);

    for (const row of rows) {
      counts.total++;
      const result = migrateValue(
        row.accessTokenEncrypted,
        "PLAID_TOKEN_ENCRYPTION_KEY",
        "PLAID_TOKEN_ENCRYPTION_KEY",
        row.userId,
      );
      if (result.status === "already") {
        counts.already++;
        continue;
      }
      if (result.status === "failed") {
        counts.failed++;
        failures.push(`plaid_items ${row.id}: ${result.error}`);
        continue;
      }
      counts.migrated++;
      if (APPLY) {
        await db.update(plaidItems).set({ accessTokenEncrypted: result.newPayload }).where(eq(plaidItems.id, row.id));
        // Keep the provider-neutral mirror row in sync (verbatim copy, same as upsertPlaidBrokerageConnection).
        await db
          .update(brokerageConnections)
          .set({ accessTokenEncrypted: result.newPayload })
          .where(
            and(
              eq(brokerageConnections.userId, row.userId),
              eq(brokerageConnections.provider, "plaid"),
              eq(brokerageConnections.externalConnectionId, row.itemId),
            ),
          );
      }
    }
    report("plaid_items", counts, failures);
  }

  // --- brokerage_connections (schwab only): move to BROKERAGE_TOKEN_ENCRYPTION_KEY + AAD=userId ---
  {
    const counts = newCounts();
    const failures: string[] = [];
    const rows = await db
      .select({
        id: brokerageConnections.id,
        userId: brokerageConnections.userId,
        accessTokenEncrypted: brokerageConnections.accessTokenEncrypted,
        refreshTokenEncrypted: brokerageConnections.refreshTokenEncrypted,
      })
      .from(brokerageConnections)
      .where(eq(brokerageConnections.provider, "schwab"));

    for (const row of rows) {
      counts.total++;
      const accessResult = migrateValue(
        row.accessTokenEncrypted,
        "PLAID_TOKEN_ENCRYPTION_KEY",
        "BROKERAGE_TOKEN_ENCRYPTION_KEY",
        row.userId,
      );
      const refreshResult = row.refreshTokenEncrypted
        ? migrateValue(
            row.refreshTokenEncrypted,
            "PLAID_TOKEN_ENCRYPTION_KEY",
            "BROKERAGE_TOKEN_ENCRYPTION_KEY",
            row.userId,
          )
        : ({ status: "already" } as const);

      if (accessResult.status === "failed" || refreshResult.status === "failed") {
        counts.failed++;
        if (accessResult.status === "failed") failures.push(`brokerage_connections ${row.id} (access): ${accessResult.error}`);
        if (refreshResult.status === "failed") failures.push(`brokerage_connections ${row.id} (refresh): ${refreshResult.error}`);
        continue;
      }
      if (accessResult.status === "already" && refreshResult.status === "already") {
        counts.already++;
        continue;
      }
      counts.migrated++;
      if (APPLY) {
        await db
          .update(brokerageConnections)
          .set({
            accessTokenEncrypted:
              accessResult.status === "migrated" ? accessResult.newPayload : row.accessTokenEncrypted,
            refreshTokenEncrypted:
              refreshResult.status === "migrated" ? refreshResult.newPayload : row.refreshTokenEncrypted,
          })
          .where(eq(brokerageConnections.id, row.id));
      }
    }
    report("brokerage_connections (schwab)", counts, failures);
  }

  // --- exchange_api_credentials (Kraken etc): same key, add AAD=userId ---
  {
    const counts = newCounts();
    const failures: string[] = [];
    const rows = await db
      .select({
        investmentAccountId: exchangeApiCredentials.investmentAccountId,
        userId: exchangeApiCredentials.userId,
        credentialsEncrypted: exchangeApiCredentials.credentialsEncrypted,
      })
      .from(exchangeApiCredentials);

    for (const row of rows) {
      counts.total++;
      const result = migrateValue(
        row.credentialsEncrypted,
        "EXCHANGE_CREDENTIAL_ENCRYPTION_KEY",
        "EXCHANGE_CREDENTIAL_ENCRYPTION_KEY",
        row.userId,
      );
      if (result.status === "already") {
        counts.already++;
        continue;
      }
      if (result.status === "failed") {
        counts.failed++;
        failures.push(`exchange_api_credentials ${row.investmentAccountId}: ${result.error}`);
        continue;
      }
      counts.migrated++;
      if (APPLY) {
        await db
          .update(exchangeApiCredentials)
          .set({ credentialsEncrypted: result.newPayload })
          .where(eq(exchangeApiCredentials.investmentAccountId, row.investmentAccountId));
      }
    }
    report("exchange_api_credentials", counts, failures);
  }

  // --- lighter_credentials: same key, add AAD=userId ---
  {
    const counts = newCounts();
    const failures: string[] = [];
    const rows = await db
      .select({
        investmentAccountId: lighterCredentials.investmentAccountId,
        userId: lighterCredentials.userId,
        readOnlyTokenEncrypted: lighterCredentials.readOnlyTokenEncrypted,
      })
      .from(lighterCredentials);

    for (const row of rows) {
      counts.total++;
      const result = migrateValue(
        row.readOnlyTokenEncrypted,
        "EXCHANGE_CREDENTIAL_ENCRYPTION_KEY",
        "EXCHANGE_CREDENTIAL_ENCRYPTION_KEY",
        row.userId,
      );
      if (result.status === "already") {
        counts.already++;
        continue;
      }
      if (result.status === "failed") {
        counts.failed++;
        failures.push(`lighter_credentials ${row.investmentAccountId}: ${result.error}`);
        continue;
      }
      counts.migrated++;
      if (APPLY) {
        await db
          .update(lighterCredentials)
          .set({ readOnlyTokenEncrypted: result.newPayload })
          .where(eq(lighterCredentials.investmentAccountId, row.investmentAccountId));
      }
    }
    report("lighter_credentials", counts, failures);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
