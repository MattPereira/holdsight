import "server-only";

import {
  AccountType,
  type Holding,
  type InvestmentAccount,
  type Security,
} from "plaid";

import { getClient, readPlaidError } from "@/lib/plaid/client";
import type {
  BrokerageAccountHoldings,
  BrokerageAccountTypeValue,
  BrokerageAssetClass,
  BrokerageBalance,
  HoldingsResult,
} from "@/lib/brokerage/types";

// Plaid security.type → our asset_class enum. Unmapped types fall back to
// "other" so an unexpected value never blocks a sync.
const SECURITY_TYPE_TO_ASSET_CLASS: Record<string, BrokerageAssetClass> = {
  equity: "stock",
  etf: "etf",
  "mutual fund": "etf",
  cash: "cash",
  cryptocurrency: "crypto",
  derivative: "derivative",
};

function toAssetClass(
  securityType: string | null | undefined,
): BrokerageAssetClass {
  if (!securityType) return "other";
  return SECURITY_TYPE_TO_ASSET_CLASS[securityType] ?? "other";
}

// Plaid account.subtype → our brokerage_account_type enum. Falls back to
// "taxable" (the schema default) for anything we don't recognize.
const SUBTYPE_TO_ACCOUNT_TYPE: Record<string, BrokerageAccountTypeValue> = {
  brokerage: "taxable",
  ira: "traditional_ira",
  roth: "roth_ira",
  "roth ira": "roth_ira",
  "sep ira": "sep_ira",
  "simple ira": "simple_ira",
  "401k": "401k",
  "roth 401k": "401k",
};

function toAccountType(
  subtype: string | null | undefined,
): BrokerageAccountTypeValue {
  if (!subtype) return "taxable";
  return SUBTYPE_TO_ACCOUNT_TYPE[subtype] ?? "taxable";
}

function isPlaidCashSecurity(security: Security | undefined): boolean {
  return (
    security?.type === "cash" ||
    security?.ticker_symbol?.toUpperCase().startsWith("CUR:") === true
  );
}

function isInvestmentAccount(account: InvestmentAccount): boolean {
  return (
    account.type === AccountType.Investment ||
    account.type === AccountType.Brokerage
  );
}

function cashCurrencySymbol(
  holding: Holding,
  security: Security | undefined,
): string {
  const ticker = security?.ticker_symbol?.toUpperCase();
  if (ticker?.startsWith("CUR:")) return ticker.slice("CUR:".length);

  return (
    holding.iso_currency_code ??
    holding.unofficial_currency_code ??
    security?.iso_currency_code ??
    security?.unofficial_currency_code ??
    "USD"
  );
}

function buildBalances(
  account: InvestmentAccount,
  holdings: Holding[],
  securitiesById: Map<string, Security>,
): BrokerageBalance[] {
  const balances: BrokerageBalance[] = holdings.map((holding) => {
    const security = securitiesById.get(holding.security_id);
    const isCash = isPlaidCashSecurity(security);

    return {
      sourceBalanceId: holding.security_id,
      symbol: isCash
        ? cashCurrencySymbol(holding, security)
        : (security?.ticker_symbol ?? security?.name ?? "?"),
      name: isCash ? "Cash" : (security?.name ?? undefined),
      assetClass: isCash ? "cash" : toAssetClass(security?.type),
      amount: holding.quantity,
      priceUsd: holding.institution_price,
      valueUsd: holding.institution_value,
      costBasisUsd: holding.cost_basis ?? undefined,
    };
  });

  // Some institutions (including Schwab via Plaid) report cash as a real
  // holding like CUR:USD. Only synthesize cash when Plaid omitted that holding.
  const cash = account.balances.available ?? 0;
  const hasCashHolding = holdings.some((holding) =>
    isPlaidCashSecurity(securitiesById.get(holding.security_id)),
  );
  if (cash > 0 && !hasCashHolding) {
    balances.push({
      sourceBalanceId: account.account_id,
      symbol: account.balances.iso_currency_code ?? "USD",
      name: "Cash",
      assetClass: "cash",
      amount: cash,
      priceUsd: 1,
      valueUsd: cash,
    });
  }

  return balances;
}

/**
 * Fetch investment holdings for every account under a Plaid Item and normalize
 * them into our brokerage shape. The caller passes the decrypted access token;
 * it never leaves this request.
 */
export async function getHoldings(accessToken: string): Promise<HoldingsResult> {
  try {
    const res = await getClient().investmentsHoldingsGet({
      access_token: accessToken,
    });

    const securitiesById = new Map(
      res.data.securities.map((security) => [security.security_id, security]),
    );
    const investmentAccountIds = new Set(
      res.data.accounts
        .filter(isInvestmentAccount)
        .map((account) => account.account_id),
    );

    const accounts: BrokerageAccountHoldings[] = res.data.accounts
      .filter((account) => investmentAccountIds.has(account.account_id))
      .map((account) => ({
        externalAccountId: account.account_id,
        accountName: account.name,
        accountType: toAccountType(account.subtype),
        mask: account.mask ?? null,
        balances: buildBalances(
          account,
          res.data.holdings.filter(
            (holding) =>
              holding.account_id === account.account_id &&
              investmentAccountIds.has(holding.account_id),
          ),
          securitiesById,
        ),
      }));

    return { status: "ready", accounts };
  } catch (error) {
    const { code, message, httpStatus } = readPlaidError(error);
    // The user's login expired/changed — they must re-link via Plaid Link.
    if (code === "ITEM_LOGIN_REQUIRED") return { status: "login_required" };
    return { status: "error", message, httpStatus };
  }
}
