import "server-only";

import { desc, eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import { db, type Db } from "@/db";
import {
  investmentAccounts,
  investmentBalances,
} from "@/db/schema/investment-accounts";
import type { BalancesResult, InvestmentBalance } from "@/lib/portfolio/types";
import type { WalletFamilyAccountBase } from "@/lib/wallets/account-family";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function resultStatusToSyncStatus(
  status: BalancesResult["status"],
): "success" | "indexing" | "rate_limited" | "error" {
  return status === "ready" ? "success" : status;
}

export type WalletFamilyBalanceWriteConfig<TBalance extends InvestmentBalance> = {
  syncProvider: string;
  assetClass: (balance: TBalance) => "token" | "cash";
  insertDetails?: (
    tx: Tx,
    inserted: { id: string }[],
    balances: TBalance[],
  ) => Promise<void>;
};

export type WalletFamilyBalanceResult<TBalance extends InvestmentBalance> =
  | { status: "ready"; address: string; balances: TBalance[] }
  | { status: "indexing"; address: string }
  | { status: "rate_limited"; address: string }
  | { status: "error"; address: string; message: string; httpStatus: number };

/**
 * The EVM, HyperCore, and Lighter balance syncs share this transaction
 * shape: update the account's sync status, then (only when the result is
 * ready) replace the account's balances wholesale. Per-provider balance
 * detail tables (EVM's chain/contract, HyperCore's balance type) are
 * inserted via `insertDetails`.
 */
export async function replaceWalletFamilyAccountBalances<
  TBalance extends InvestmentBalance,
>(
  investmentAccountId: string,
  result: WalletFamilyBalanceResult<TBalance>,
  config: WalletFamilyBalanceWriteConfig<TBalance>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: config.syncProvider,
        syncStatus: resultStatusToSyncStatus(result.status),
        syncHttpStatus: result.status === "error" ? result.httpStatus : null,
        syncErrorMessage: result.status === "error" ? result.message : null,
        lastSyncedAt: new Date(),
      })
      .where(eq(investmentAccounts.id, investmentAccountId));

    if (result.status !== "ready") return;

    await tx
      .delete(investmentBalances)
      .where(eq(investmentBalances.investmentAccountId, investmentAccountId));

    if (result.balances.length === 0) return;

    const insertedBalances = await tx
      .insert(investmentBalances)
      .values(
        result.balances.map((balance) => ({
          investmentAccountId,
          sourceBalanceId: balance.sourceBalanceId,
          symbol: balance.symbol,
          name: balance.name,
          assetClass: config.assetClass(balance),
          amount: String(balance.amount),
          priceUsd: String(balance.priceUsd),
          valueUsd: String(balance.valueUsd),
        })),
      )
      .returning({ id: investmentBalances.id });

    if (config.insertDetails) {
      await config.insertDetails(tx, insertedBalances, result.balances);
    }
  });
}

export function toInvestmentBalance(
  row: {
    sourceBalanceId: string | null;
    symbol: string;
    name: string | null;
    amount: string;
    priceUsd: string;
    valueUsd: string;
  },
  chainId: string,
  contractAddress?: string | null,
): InvestmentBalance {
  return {
    sourceBalanceId: row.sourceBalanceId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    chainId,
    contractAddress: contractAddress ?? undefined,
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
  };
}

type DetailJoin = {
  table: PgTable & { balanceId: AnyPgColumn };
  chainId: AnyPgColumn<{ data: string; notNull: true }>;
  contractAddress: AnyPgColumn<{ data: string; notNull: false }>;
};

/**
 * Reads an account's currently-persisted balances. EVM joins its balance
 * detail table for a per-balance chainId/contractAddress; HyperCore and
 * Lighter use a static chainId and have no detail join.
 */
export async function readPersistedWalletBalances(
  investmentAccountId: string,
  options: { chainId: string; detail?: DetailJoin },
): Promise<InvestmentBalance[]> {
  if (options.detail) {
    const rows = await db
      .select({
        sourceBalanceId: investmentBalances.sourceBalanceId,
        symbol: investmentBalances.symbol,
        name: investmentBalances.name,
        amount: investmentBalances.amount,
        priceUsd: investmentBalances.priceUsd,
        valueUsd: investmentBalances.valueUsd,
        chainId: options.detail.chainId,
        contractAddress: options.detail.contractAddress,
      })
      .from(investmentBalances)
      .leftJoin(
        options.detail.table,
        eq(options.detail.table.balanceId, investmentBalances.id),
      )
      .where(eq(investmentBalances.investmentAccountId, investmentAccountId))
      .orderBy(desc(investmentBalances.valueUsd));

    return rows.map((row) =>
      toInvestmentBalance(
        row,
        row.chainId ?? options.chainId,
        row.contractAddress,
      ),
    );
  }

  const rows = await db
    .select({
      sourceBalanceId: investmentBalances.sourceBalanceId,
      symbol: investmentBalances.symbol,
      name: investmentBalances.name,
      amount: investmentBalances.amount,
      priceUsd: investmentBalances.priceUsd,
      valueUsd: investmentBalances.valueUsd,
    })
    .from(investmentBalances)
    .where(eq(investmentBalances.investmentAccountId, investmentAccountId))
    .orderBy(desc(investmentBalances.valueUsd));

  return rows.map((row) => toInvestmentBalance(row, options.chainId));
}

/**
 * Maps a wallet-family account's persisted sync status onto a
 * `BalancesResult` when it's not ready to be read as balances (idle,
 * indexing, rate-limited, or error). Returns `undefined` when the account is
 * ready and its balances should be read.
 */
export function getWalletFamilyAccountBalanceStatus(
  account: WalletFamilyAccountBase,
  defaultErrorMessage: string,
): BalancesResult | undefined {
  if (account.syncStatus === "idle") {
    return { status: "ready", address: account.address, balances: [] };
  }

  if (account.syncStatus === "indexing" || account.syncStatus === "rate_limited") {
    return { status: account.syncStatus, address: account.address };
  }

  if (account.syncStatus === "error") {
    return {
      status: "error",
      address: account.address,
      message: account.syncErrorMessage ?? defaultErrorMessage,
      httpStatus: account.syncHttpStatus ?? 502,
    };
  }

  return undefined;
}

/**
 * The EVM and HyperCore balance reads share this loop: one result per
 * account, branching on the account's persisted sync status before reading
 * its balances. Lighter can't use this directly since several Lighter
 * accounts may share one wallet address and are reduced into one result.
 */
export async function getCurrentWalletFamilyBalances(
  accounts: WalletFamilyAccountBase[],
  options: {
    chainId: string;
    defaultErrorMessage: string;
    detail?: DetailJoin;
  },
): Promise<BalancesResult[]> {
  const results: BalancesResult[] = [];

  for (const account of accounts) {
    const status = getWalletFamilyAccountBalanceStatus(
      account,
      options.defaultErrorMessage,
    );
    if (status) {
      results.push(status);
      continue;
    }

    const balances = await readPersistedWalletBalances(account.id, {
      chainId: options.chainId,
      detail: options.detail,
    });
    results.push({ status: "ready", address: account.address, balances });
  }

  return results;
}
