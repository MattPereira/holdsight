import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  evmWalletAccounts,
  financialAccounts,
} from "@/db/schema/financial-accounts";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type SavedEvmAccount = {
  id: string;
  address: string;
  label: string | null;
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
      id: financialAccounts.id,
      address: evmWalletAccounts.address,
      label: financialAccounts.label,
    })
    .from(evmWalletAccounts)
    .innerJoin(
      financialAccounts,
      eq(evmWalletAccounts.financialAccountId, financialAccounts.id),
    )
    .where(
      and(
        eq(evmWalletAccounts.userId, userId),
        eq(financialAccounts.userId, userId),
        eq(financialAccounts.kind, "evm_wallet"),
        eq(financialAccounts.status, "active"),
      ),
    )
    .orderBy(desc(financialAccounts.createdAt));
}

export async function userHasEvmAccountAddress(
  userId: string,
  address: string,
): Promise<boolean> {
  const normalized = normalizeEvmAddress(address);
  const [account] = await db
    .select({ id: evmWalletAccounts.financialAccountId })
    .from(evmWalletAccounts)
    .innerJoin(
      financialAccounts,
      eq(evmWalletAccounts.financialAccountId, financialAccounts.id),
    )
    .where(
      and(
        eq(evmWalletAccounts.userId, userId),
        eq(evmWalletAccounts.address, normalized),
        eq(financialAccounts.userId, userId),
        eq(financialAccounts.kind, "evm_wallet"),
        eq(financialAccounts.status, "active"),
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

    const financialAccountId = randomUUID();
    await db.batch([
      db.insert(financialAccounts).values({
        id: financialAccountId,
        userId,
        kind: "evm_wallet",
        provider: "manual",
      }),
      db.insert(evmWalletAccounts).values({
        financialAccountId,
        userId,
        address,
      }),
    ]);

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
    .select({ id: evmWalletAccounts.financialAccountId })
    .from(evmWalletAccounts)
    .innerJoin(
      financialAccounts,
      eq(evmWalletAccounts.financialAccountId, financialAccounts.id),
    )
    .where(
      and(
        eq(evmWalletAccounts.userId, userId),
        eq(evmWalletAccounts.address, normalized),
        eq(financialAccounts.userId, userId),
      ),
    )
    .limit(1);

  if (!account) return;

  await db
    .delete(financialAccounts)
    .where(
      and(
        eq(financialAccounts.id, account.id),
        eq(financialAccounts.userId, userId),
      ),
    );
}

export async function validateUserEvmAccounts(
  userId: string,
): Promise<string | null> {
  const accounts = await getUserEvmAccounts(userId);
  if (accounts.length === 0) {
    return "Add at least one wallet before loading positions.";
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
