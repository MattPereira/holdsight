import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  brokerageAccounts,
  brokerageConnections,
  investmentAccounts,
  investmentBalances,
  plaidItems,
} from "@/db/schema/investment-accounts";
import {
  getConnectionAccountLinks,
  getItemAccountLinks,
  getUserBrokerageAccounts,
  saveBrokerageConnectionAccounts,
  type SavedBrokerageAccount,
} from "@/lib/brokerage/accounts";
import {
  getUserSchwabConnections,
  upsertPlaidBrokerageConnection,
  type SavedBrokerageConnection,
} from "@/lib/brokerage/connections";
import {
  decryptBrokerageToken,
  encryptBrokerageToken,
} from "@/lib/brokerage/crypto";
import { decrypt } from "@/lib/plaid/crypto";
import {
  getUserBrokeragePlaidItems,
  type SavedPlaidItem,
} from "@/lib/plaid/items";
import { getPlaidHoldings } from "@/lib/brokerage/providers/plaid/client";
import { getSchwabHoldings } from "@/lib/brokerage/providers/schwab/client";
import { SCHWAB_BROKERAGE_PROVIDER } from "@/lib/brokerage/providers/schwab/config";
import {
  refreshSchwabAccessToken,
  schwabTokenExpiresAt,
} from "@/lib/brokerage/providers/schwab/oauth";
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
  provider: string,
): Promise<void> {
  await tx
    .update(investmentAccounts)
    .set({
      syncProvider: provider,
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
  provider: string,
): Promise<void> {
  for (const id of investmentAccountIds) {
    await tx
      .update(investmentAccounts)
      .set({
        syncProvider: provider,
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
        status:
          result.status === "ready"
            ? "active"
            : result.status === "login_required"
              ? "login_required"
              : "error",
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
        PLAID_PROVIDER,
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
      await writeAccountBalances(
        tx,
        investmentAccountId,
        account,
        PLAID_PROVIDER,
      );
    }
  });

  await upsertPlaidBrokerageConnection(plaidItemId);
}

/**
 * Fetch holdings for one Plaid Item and persist them. The decrypted access
 * token never leaves this function.
 */
export async function syncPlaidItem(
  userId: string,
  item: SavedPlaidItem,
): Promise<HoldingsResult> {
  const accessToken = decrypt(item.accessTokenEncrypted, userId);
  const result = await getPlaidHoldings(accessToken);
  await applyItemHoldings(item.id, result);
  return result;
}

export async function applySchwabConnectionHoldings(
  connectionId: string,
  result: HoldingsResult,
): Promise<void> {
  const links = await getConnectionAccountLinks(connectionId);
  const accountIdByExternal = new Map(
    links.map((link) => [link.externalAccountId, link.investmentAccountId]),
  );

  await db.transaction(async (tx) => {
    await tx
      .update(brokerageConnections)
      .set({
        status:
          result.status === "ready"
            ? "active"
            : result.status === "login_required"
              ? "login_required"
              : "error",
        lastSyncedAt: new Date(),
      })
      .where(eq(brokerageConnections.id, connectionId));

    if (result.status !== "ready") {
      const message =
        result.status === "login_required"
          ? "Login required — please reconnect Schwab."
          : result.message;
      const httpStatus = result.status === "error" ? result.httpStatus : null;
      await markAccountsFailed(
        tx,
        links.map((link) => link.investmentAccountId),
        message,
        httpStatus,
        SCHWAB_BROKERAGE_PROVIDER,
      );
      return;
    }

    for (const account of result.accounts) {
      const investmentAccountId = accountIdByExternal.get(
        account.externalAccountId,
      );
      if (!investmentAccountId) continue;
      await writeAccountBalances(
        tx,
        investmentAccountId,
        account,
        SCHWAB_BROKERAGE_PROVIDER,
      );
    }
  });
}

export async function syncSchwabConnection(
  connection: SavedBrokerageConnection,
): Promise<HoldingsResult> {
  const accessToken = await getUsableSchwabAccessToken(connection);
  const result = await getSchwabHoldings(accessToken);

  if (result.status === "ready") {
    await saveBrokerageConnectionAccounts(
      connection.userId,
      connection.id,
      SCHWAB_BROKERAGE_PROVIDER,
      connection.institutionName ?? "Charles Schwab",
      result.accounts,
    );
  }

  await applySchwabConnectionHoldings(connection.id, result);
  return result;
}

async function getUsableSchwabAccessToken(
  connection: SavedBrokerageConnection,
): Promise<string> {
  const expiresAt = connection.tokenExpiresAt?.getTime() ?? null;
  const refreshBefore = Date.now() + 60_000;

  if (!expiresAt || expiresAt > refreshBefore) {
    return decryptBrokerageToken(connection.accessTokenEncrypted, connection.userId);
  }

  if (!connection.refreshTokenEncrypted) {
    return decryptBrokerageToken(connection.accessTokenEncrypted, connection.userId);
  }

  const refreshToken = decryptBrokerageToken(
    connection.refreshTokenEncrypted,
    connection.userId,
  );
  const tokens = await refreshSchwabAccessToken(refreshToken);
  const refreshTokenEncrypted = tokens.refresh_token
    ? encryptBrokerageToken(tokens.refresh_token, connection.userId)
    : connection.refreshTokenEncrypted;

  await db
    .update(brokerageConnections)
    .set({
      accessTokenEncrypted: encryptBrokerageToken(
        tokens.access_token,
        connection.userId,
      ),
      refreshTokenEncrypted,
      tokenExpiresAt: schwabTokenExpiresAt(tokens.expires_in),
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(brokerageConnections.id, connection.id));

  return tokens.access_token;
}

/**
 * Sync every Plaid Item the user has linked. Items are independent logins, so a
 * failure on one doesn't stop the others.
 */
export async function syncUserBrokerageBalances(userId: string): Promise<void> {
  const [items, schwabConnections] = await Promise.all([
    getUserBrokeragePlaidItems(userId),
    getUserSchwabConnections(userId),
  ]);

  for (const item of items) {
    await syncPlaidItem(userId, item);
  }

  for (const connection of schwabConnections) {
    await syncSchwabConnection(connection);
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
    costBasisUsd:
      row.costBasisUsd === null ? undefined : Number(row.costBasisUsd),
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
