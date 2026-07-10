import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  investmentAccounts,
  type investmentAccountKind,
} from "@/db/schema/investment-accounts";

export type WalletFamilySyncStatus =
  | "idle"
  | "success"
  | "indexing"
  | "rate_limited"
  | "error";

export type WalletFamilyAccountBase = {
  id: string;
  address: string;
  label: string | null;
  syncStatus: WalletFamilySyncStatus;
  syncHttpStatus: number | null;
  syncErrorMessage: string | null;
};

type WalletFamilyTable = PgTable & {
  investmentAccountId: AnyPgColumn;
  userId: AnyPgColumn;
  address: AnyPgColumn<{ data: string; notNull: true }>;
};

/**
 * The EVM, HyperCore, and Lighter account tables share this join/select
 * shape: an inner join back to `investmentAccounts` scoped by userId, a
 * `kind` literal, and active status, ordered newest-first. Lighter's table
 * carries extra columns (account index, parent EVM account) passed via
 * `extraColumns`.
 */
export async function getUserWalletFamilyAccounts<
  Extra extends Record<string, AnyPgColumn> = Record<string, never>,
>(config: {
  table: WalletFamilyTable;
  kind: (typeof investmentAccountKind.enumValues)[number];
  userId: string;
  extraColumns?: Extra;
}) {
  const { table, kind, userId, extraColumns } = config;

  return db
    .select({
      id: investmentAccounts.id,
      address: table.address,
      label: investmentAccounts.label,
      syncStatus: investmentAccounts.syncStatus,
      syncHttpStatus: investmentAccounts.syncHttpStatus,
      syncErrorMessage: investmentAccounts.syncErrorMessage,
      ...(extraColumns ?? ({} as Extra)),
    })
    .from(table)
    .innerJoin(
      investmentAccounts,
      eq(table.investmentAccountId, investmentAccounts.id),
    )
    .where(
      and(
        eq(table.userId, userId),
        eq(investmentAccounts.userId, userId),
        eq(investmentAccounts.kind, kind),
        eq(investmentAccounts.status, "active"),
      ),
    )
    .orderBy(desc(investmentAccounts.createdAt));
}
