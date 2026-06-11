import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  centralizedExchangeAccounts,
  exchangeApiCredentials,
  investmentAccounts,
} from "@/db/schema/investment-accounts";
import {
  decryptExchangeApiCredentials,
  encryptExchangeApiCredentials,
  type ExchangeApiCredentials,
} from "@/lib/exchange/credentials-crypto";

const KRAKEN_EXCHANGE = "kraken";

export type SavedKrakenAccount = {
  id: string;
  label: string | null;
  exchange: string;
  externalAccountId: string | null;
  syncStatus: "idle" | "success" | "indexing" | "rate_limited" | "error";
  syncHttpStatus: number | null;
  syncErrorMessage: string | null;
};

export async function getUserKrakenAccounts(
  userId: string,
): Promise<SavedKrakenAccount[]> {
  return db
    .select({
      id: investmentAccounts.id,
      label: investmentAccounts.label,
      exchange: centralizedExchangeAccounts.exchange,
      externalAccountId: centralizedExchangeAccounts.externalAccountId,
      syncStatus: investmentAccounts.syncStatus,
      syncHttpStatus: investmentAccounts.syncHttpStatus,
      syncErrorMessage: investmentAccounts.syncErrorMessage,
    })
    .from(centralizedExchangeAccounts)
    .innerJoin(
      investmentAccounts,
      eq(
        centralizedExchangeAccounts.investmentAccountId,
        investmentAccounts.id,
      ),
    )
    .where(
      and(
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, "centralized_exchange"),
        eq(investmentAccounts.status, "active"),
        eq(centralizedExchangeAccounts.exchange, KRAKEN_EXCHANGE),
      ),
    )
    .orderBy(desc(investmentAccounts.createdAt));
}

export async function ensureUserKrakenAccount(
  userId: string,
): Promise<SavedKrakenAccount[]> {
  const accounts = await getUserKrakenAccounts(userId);
  if (accounts.length > 0) return accounts;

  const investmentAccountId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(investmentAccounts).values({
      id: investmentAccountId,
      userId,
      kind: "centralized_exchange",
      provider: KRAKEN_EXCHANGE,
      label: "Kraken",
    });

    await tx.insert(centralizedExchangeAccounts).values({
      investmentAccountId,
      exchange: KRAKEN_EXCHANGE,
    });
  });

  return getUserKrakenAccounts(userId);
}

export async function saveUserKrakenCredentials(
  userId: string,
  credentials: ExchangeApiCredentials,
): Promise<SavedKrakenAccount> {
  const [account] = await ensureUserKrakenAccount(userId);
  if (!account) {
    throw new Error("Failed to create Kraken account.");
  }

  const credentialsEncrypted = encryptExchangeApiCredentials(credentials);
  await db
    .insert(exchangeApiCredentials)
    .values({
      investmentAccountId: account.id,
      userId,
      exchange: KRAKEN_EXCHANGE,
      credentialsEncrypted,
    })
    .onConflictDoUpdate({
      target: exchangeApiCredentials.investmentAccountId,
      set: {
        credentialsEncrypted,
        exchange: KRAKEN_EXCHANGE,
        updatedAt: new Date(),
      },
    });

  return account;
}

export async function getUserKrakenCredentials(
  userId: string,
  investmentAccountId: string,
): Promise<ExchangeApiCredentials | null> {
  const [row] = await db
    .select({
      credentialsEncrypted: exchangeApiCredentials.credentialsEncrypted,
    })
    .from(exchangeApiCredentials)
    .innerJoin(
      investmentAccounts,
      eq(exchangeApiCredentials.investmentAccountId, investmentAccounts.id),
    )
    .where(
      and(
        eq(exchangeApiCredentials.userId, userId),
        eq(exchangeApiCredentials.investmentAccountId, investmentAccountId),
        eq(exchangeApiCredentials.exchange, KRAKEN_EXCHANGE),
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, "centralized_exchange"),
        eq(investmentAccounts.status, "active"),
      ),
    )
    .limit(1);

  return row
    ? decryptExchangeApiCredentials(row.credentialsEncrypted)
    : null;
}
