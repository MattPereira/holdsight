import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  brokerageAccounts,
  investmentAccounts,
  investmentBalances,
  plaidItems,
} from "@/db/schema/investment-accounts";
import {
  getItemAccountLinks,
  getUserBrokerageAccounts,
  type SavedBrokerageAccount,
} from "@/lib/brokerage/accounts";
import { getHoldings } from "@/lib/brokerage/client";
import { decrypt } from "@/lib/plaid/crypto";
import {
  getUserBrokeragePlaidItems,
  type SavedPlaidItem,
} from "@/lib/plaid/items";
import type {
  BrokerageAccountHoldings,
  BrokerageBalance,
  HoldingsResult,
} from "@/lib/brokerage/types";

const PLAID_PROVIDER = "plaid";

export type CurrentBrokerageAccount = SavedBrokerageAccount & {
  balances: BrokerageBalance[];
};

function balanceToRow(
  investmentAccountId: string,
  balance: BrokerageBalance,
) {
  return {
    investmentAccountId,
    sourceBalanceId: balance.sourceBalanceId,
    symbol: balance.symbol,
    name: balance.name,
    assetClass: balance.assetClass,
    amount: String(balance.amount),
    priceUsd: String(balance.priceUsd),
    valueUsd: String(balance.valueUsd),
    costBasisUsd:
      balance.costBasisUsd === undefined ? null : String(balance.costBasisUsd),
  };
}

async function writeAccountBalances(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  investmentAccountId: string,
  account: BrokerageAccountHoldings,
): Promise<void> {
  await tx
    .update(investmentAccounts)
    .set({
      syncProvider: PLAID_PROVIDER,
      syncStatus: "success",
      syncHttpStatus: null,
      syncErrorMessage: null,
      lastSyncedAt: new Date(),
    })
    .where(eq(investmentAccounts.id, investmentAccountId));

  await tx
    .update(brokerageAccounts)
    .set({ accountType: account.accountType })
    .where(eq(brokerageAccounts.investmentAccountId, investmentAccountId));

  await tx
    .delete(investmentBalances)
    .where(eq(investmentBalances.investmentAccountId, investmentAccountId));

  if (account.balances.length === 0) return;

  await tx
    .insert(investmentBalances)
    .values(
      account.balances.map((balance) =>
        balanceToRow(investmentAccountId, balance),
      ),
    );
}

async function markAccountsFailed(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  investmentAccountIds: string[],
  message: string,
  httpStatus: number | null,
): Promise<void> {
  for (const id of investmentAccountIds) {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: PLAID_PROVIDER,
        syncStatus: "error",
        syncHttpStatus: httpStatus,
        syncErrorMessage: message,
        lastSyncedAt: new Date(),
      })
      .where(eq(investmentAccounts.id, id));
  }
}

/**
 * Persist an already-fetched holdings result for one Plaid Item: update the
 * Item's status and replace each brokerage account's balances (delete-then-
 * insert, like the EVM sync). Used by both the link flow (which already has the
 * holdings) and the refresh flow, so we never fetch the same holdings twice.
 */
export async function applyItemHoldings(
  plaidItemId: string,
  result: HoldingsResult,
): Promise<void> {
  const links = await getItemAccountLinks(plaidItemId);
  const accountIdByExternal = new Map(
    links.map((link) => [link.externalAccountId, link.investmentAccountId]),
  );

  await db.transaction(async (tx) => {
    await tx
      .update(plaidItems)
      .set({
        status: result.status === "ready" ? "active" : result.status === "login_required" ? "login_required" : "error",
        lastSyncedAt: new Date(),
      })
      .where(eq(plaidItems.id, plaidItemId));

    if (result.status !== "ready") {
      const message =
        result.status === "login_required"
          ? "Login required — please re-link this institution."
          : result.message;
      const httpStatus = result.status === "error" ? result.httpStatus : null;
      await markAccountsFailed(
        tx,
        links.map((link) => link.investmentAccountId),
        message,
        httpStatus,
      );
      return;
    }

    for (const account of result.accounts) {
      const investmentAccountId = accountIdByExternal.get(
        account.externalAccountId,
      );
      // Accounts added at the institution after linking won't have a row yet;
      // they get picked up the next time the user re-links.
      if (!investmentAccountId) continue;
      await writeAccountBalances(tx, investmentAccountId, account);
    }
  });
}

/**
 * Fetch holdings for one Plaid Item and persist them. The decrypted access
 * token never leaves this function.
 */
export async function syncPlaidItem(
  item: SavedPlaidItem,
): Promise<HoldingsResult> {
  const accessToken = decrypt(item.accessTokenEncrypted);
  const result = await getHoldings(accessToken);
  await applyItemHoldings(item.id, result);
  return result;
}

/**
 * Sync every Plaid Item the user has linked. Items are independent logins, so a
 * failure on one doesn't stop the others.
 */
export async function syncUserBrokerageBalances(userId: string): Promise<void> {
  const items = await getUserBrokeragePlaidItems(userId);
  for (const item of items) {
    await syncPlaidItem(item);
  }
}

const BROKERAGE_ASSET_CLASSES: ReadonlySet<BrokerageBalance["assetClass"]> =
  new Set(["stock", "etf", "cash", "crypto", "derivative", "other"]);

function toBrokerageAssetClass(value: string): BrokerageBalance["assetClass"] {
  return BROKERAGE_ASSET_CLASSES.has(value as BrokerageBalance["assetClass"])
    ? (value as BrokerageBalance["assetClass"])
    : "other";
}

function toBrokerageBalance(row: {
  sourceBalanceId: string | null;
  symbol: string;
  name: string | null;
  assetClass: string;
  amount: string;
  priceUsd: string;
  valueUsd: string;
  costBasisUsd: string | null;
}): BrokerageBalance {
  return {
    sourceBalanceId: row.sourceBalanceId ?? undefined,
    symbol: row.symbol,
    name: row.name ?? undefined,
    assetClass: toBrokerageAssetClass(row.assetClass),
    amount: Number(row.amount),
    priceUsd: Number(row.priceUsd),
    valueUsd: Number(row.valueUsd),
    costBasisUsd: row.costBasisUsd === null ? undefined : Number(row.costBasisUsd),
  };
}

function normalizeBrokerageBalance(
  balance: BrokerageBalance,
): BrokerageBalance {
  const symbol = balance.symbol.trim();
  if (
    balance.assetClass === "cash" &&
    symbol.toUpperCase().startsWith("CUR:")
  ) {
    return {
      ...balance,
      symbol: symbol.slice("CUR:".length).toUpperCase(),
      name: "Cash",
    };
  }

  return balance;
}

function dedupeCashBalances(
  balances: BrokerageBalance[],
  externalAccountId: string | null,
): BrokerageBalance[] {
  const deduped: BrokerageBalance[] = [];
  const seenCash = new Map<string, number>();

  for (const balance of balances.map(normalizeBrokerageBalance)) {
    if (balance.assetClass !== "cash") {
      deduped.push(balance);
      continue;
    }

    const key = [
      balance.symbol.toUpperCase(),
      balance.amount,
      balance.priceUsd,
      balance.valueUsd,
    ].join(":");
    const existingIndex = seenCash.get(key);

    if (existingIndex === undefined) {
      seenCash.set(key, deduped.length);
      deduped.push(balance);
      continue;
    }

    const existing = deduped[existingIndex];
    if (
      externalAccountId &&
      existing.sourceBalanceId === externalAccountId &&
      balance.sourceBalanceId !== externalAccountId
    ) {
      deduped[existingIndex] = balance;
    }
  }

  return deduped;
}

export async function getCurrentBrokerageBalances(
  userId: string,
): Promise<CurrentBrokerageAccount[]> {
  const accounts = await getUserBrokerageAccounts(userId);
  const results: CurrentBrokerageAccount[] = [];

  for (const account of accounts) {
    const rows = await db
      .select({
        sourceBalanceId: investmentBalances.sourceBalanceId,
        symbol: investmentBalances.symbol,
        name: investmentBalances.name,
        assetClass: investmentBalances.assetClass,
        amount: investmentBalances.amount,
        priceUsd: investmentBalances.priceUsd,
        valueUsd: investmentBalances.valueUsd,
        costBasisUsd: investmentBalances.costBasisUsd,
      })
      .from(investmentBalances)
      .where(eq(investmentBalances.investmentAccountId, account.id))
      .orderBy(desc(investmentBalances.valueUsd));

    results.push({
      ...account,
      balances: dedupeCashBalances(
        rows.map(toBrokerageBalance),
        account.externalAccountId,
      ),
    });
  }

  return results;
}
