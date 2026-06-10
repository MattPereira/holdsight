import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  evmWalletAccounts,
  investmentAccounts,
} from "@/db/schema/investment-accounts";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type SavedEvmAccount = {
  id: string;
  address: string;
  label: string | null;
  syncStatus: "idle" | "success" | "indexing" | "rate_limited" | "error";
  syncHttpStatus: number | null;
  syncErrorMessage: string | null;
};

export function isValidEvmAddress(address: string): boolean {
  return EVM_ADDRESS_RE.test(address);
}

export function normalizeEvmAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function parseEvmAddresses(value: string | undefined): string[] {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map(normalizeEvmAddress)
        .filter(Boolean),
    ),
  );
}

export async function getUserEvmAccounts(
  userId: string,
): Promise<SavedEvmAccount[]> {
  return db
    .select({
      id: investmentAccounts.id,
      address: evmWalletAccounts.address,
      label: investmentAccounts.label,
      syncStatus: investmentAccounts.syncStatus,
      syncHttpStatus: investmentAccounts.syncHttpStatus,
      syncErrorMessage: investmentAccounts.syncErrorMessage,
    })
    .from(evmWalletAccounts)
    .innerJoin(
      investmentAccounts,
      eq(evmWalletAccounts.investmentAccountId, investmentAccounts.id),
    )
    .where(
      and(
        eq(evmWalletAccounts.userId, userId),
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, "evm_wallet"),
        eq(investmentAccounts.status, "active"),
      ),
    )
    .orderBy(desc(investmentAccounts.createdAt));
}

export async function userHasEvmAccountAddress(
  userId: string,
  address: string,
): Promise<boolean> {
  const normalized = normalizeEvmAddress(address);
  const [account] = await db
    .select({ id: evmWalletAccounts.investmentAccountId })
    .from(evmWalletAccounts)
    .innerJoin(
      investmentAccounts,
      eq(evmWalletAccounts.investmentAccountId, investmentAccounts.id),
    )
    .where(
      and(
        eq(evmWalletAccounts.userId, userId),
        eq(evmWalletAccounts.address, normalized),
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, "evm_wallet"),
        eq(investmentAccounts.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(account);
}

export async function addUserEvmAccounts(
  userId: string,
  input: string,
): Promise<{ added: number; error: string | null }> {
  const addresses = parseEvmAddresses(input);
  if (addresses.length === 0) {
    return { added: 0, error: "Enter at least one wallet address." };
  }

  const invalidAddress = addresses.find((address) => !isValidEvmAddress(address));
  if (invalidAddress) {
    return { added: 0, error: `Invalid wallet address: ${invalidAddress}` };
  }

  let added = 0;
  for (const address of addresses) {
    const exists = await userHasEvmAccountAddress(userId, address);
    if (exists) continue;

    const investmentAccountId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(investmentAccounts).values({
        id: investmentAccountId,
        userId,
        kind: "evm_wallet",
        provider: "manual",
      });

      await tx.insert(evmWalletAccounts).values({
        investmentAccountId,
        userId,
        address,
      });
    });

    added += 1;
  }

  return { added, error: null };
}

export async function removeUserEvmAccount(
  userId: string,
  address: string,
): Promise<void> {
  const normalized = normalizeEvmAddress(address);
  const [account] = await db
    .select({ id: evmWalletAccounts.investmentAccountId })
    .from(evmWalletAccounts)
    .innerJoin(
      investmentAccounts,
      eq(evmWalletAccounts.investmentAccountId, investmentAccounts.id),
    )
    .where(
      and(
        eq(evmWalletAccounts.userId, userId),
        eq(evmWalletAccounts.address, normalized),
        eq(investmentAccounts.userId, userId),
      ),
    )
    .limit(1);

  if (!account) return;

  await db
    .delete(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.id, account.id),
        eq(investmentAccounts.userId, userId),
      ),
    );
}

export async function validateUserEvmAccounts(
  userId: string,
): Promise<string | null> {
  const accounts = await getUserEvmAccounts(userId);
  if (accounts.length === 0) {
    return "Add at least one wallet before loading balances.";
  }

  const invalidAddress = accounts
    .map((account) => account.address)
    .find((address) => !EVM_ADDRESS_RE.test(address));

  if (invalidAddress) {
    return `Invalid saved wallet address: ${invalidAddress}`;
  }

  return null;
}

export async function getUserEvmAccountAddresses(
  userId: string,
): Promise<string[]> {
  const accounts = await getUserEvmAccounts(userId);
  return accounts.map((account) => account.address).filter(Boolean);
}
