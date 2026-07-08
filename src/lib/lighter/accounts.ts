import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  evmWalletAccounts,
  investmentAccounts,
  lighterAccounts,
  lighterCredentials,
} from "@/db/schema/investment-accounts";
import { fetchLighterAccount } from "@/lib/lighter/client";
import { decryptWithEnvKey, encryptWithEnvKey } from "@/lib/security/encryption";

const ENCRYPTION_KEY = "EXCHANGE_CREDENTIAL_ENCRYPTION_KEY";

export type SavedLighterAccount = {
  id: string;
  evmInvestmentAccountId: string;
  accountIndex: number;
  address: string;
  label: string | null;
  syncStatus: "idle" | "success" | "indexing" | "rate_limited" | "error";
  syncHttpStatus: number | null;
  syncErrorMessage: string | null;
};

export function parseLighterReadOnlyToken(token: string): {
  accountIndex: number;
  expiresAt: Date;
} {
  const match = /^ro:(\d+):(single|all):(\d+):[a-fA-F0-9]+$/.exec(token.trim());
  if (!match) throw new Error("Enter a valid Lighter canonical read-only token.");
  const accountIndex = Number(match[1]);
  const expiresAt = new Date(Number(match[3]) * 1_000);
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) {
    throw new Error("Lighter token contains an invalid account index.");
  }
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new Error("Lighter read-only token is expired.");
  }
  return { accountIndex, expiresAt };
}

export async function getUserLighterAccounts(userId: string): Promise<SavedLighterAccount[]> {
  return db.select({
    id: investmentAccounts.id,
    evmInvestmentAccountId: lighterAccounts.evmInvestmentAccountId,
    accountIndex: lighterAccounts.accountIndex,
    address: lighterAccounts.address,
    label: investmentAccounts.label,
    syncStatus: investmentAccounts.syncStatus,
    syncHttpStatus: investmentAccounts.syncHttpStatus,
    syncErrorMessage: investmentAccounts.syncErrorMessage,
  }).from(lighterAccounts).innerJoin(
    investmentAccounts,
    eq(lighterAccounts.investmentAccountId, investmentAccounts.id),
  ).where(and(
    eq(lighterAccounts.userId, userId),
    eq(investmentAccounts.userId, userId),
    eq(investmentAccounts.kind, "lighter"),
    eq(investmentAccounts.status, "active"),
  )).orderBy(desc(investmentAccounts.createdAt));
}

export async function getLighterToken(userId: string, accountId: string): Promise<string | null> {
  const [row] = await db.select({ value: lighterCredentials.readOnlyTokenEncrypted })
    .from(lighterCredentials)
    .where(and(
      eq(lighterCredentials.userId, userId),
      eq(lighterCredentials.investmentAccountId, accountId),
    )).limit(1);
  return row ? decryptWithEnvKey(row.value, ENCRYPTION_KEY, userId) : null;
}

export async function connectLighterAccount(input: {
  userId: string;
  evmInvestmentAccountId: string;
  token: string;
}): Promise<SavedLighterAccount> {
  const token = input.token.trim();
  const parsed = parseLighterReadOnlyToken(token);
  const [wallet] = await db.select({
    address: evmWalletAccounts.address,
    label: investmentAccounts.label,
  }).from(evmWalletAccounts).innerJoin(
    investmentAccounts,
    eq(evmWalletAccounts.investmentAccountId, investmentAccounts.id),
  ).where(and(
    eq(evmWalletAccounts.userId, input.userId),
    eq(evmWalletAccounts.investmentAccountId, input.evmInvestmentAccountId),
    eq(investmentAccounts.userId, input.userId),
    eq(investmentAccounts.kind, "evm_wallet"),
  )).limit(1);
  if (!wallet) throw new Error("Selected EVM wallet was not found.");

  const remote = await fetchLighterAccount(parsed.accountIndex, token);
  if (remote.l1Address !== wallet.address.toLowerCase()) {
    throw new Error("This Lighter token does not belong to the selected EVM wallet.");
  }

  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(investmentAccounts).values({
      id,
      userId: input.userId,
      kind: "lighter",
      provider: "lighter",
      label: wallet.label,
    });
    await tx.insert(lighterAccounts).values({
      investmentAccountId: id,
      userId: input.userId,
      evmInvestmentAccountId: input.evmInvestmentAccountId,
      accountIndex: parsed.accountIndex,
      address: wallet.address.toLowerCase(),
    });
    await tx.insert(lighterCredentials).values({
      investmentAccountId: id,
      userId: input.userId,
      readOnlyTokenEncrypted: encryptWithEnvKey(token, ENCRYPTION_KEY, input.userId),
      expiresAt: parsed.expiresAt,
    });
  });
  const account = (await getUserLighterAccounts(input.userId)).find((item) => item.id === id);
  if (!account) throw new Error("Failed to save Lighter connection.");
  return account;
}

export async function removeLighterAccount(userId: string, accountId: string): Promise<void> {
  await db.delete(investmentAccounts).where(and(
    eq(investmentAccounts.id, accountId),
    eq(investmentAccounts.userId, userId),
    eq(investmentAccounts.kind, "lighter"),
  ));
}
