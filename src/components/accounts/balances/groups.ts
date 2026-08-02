import type {
  BalanceGroup,
  BalanceRow,
  SecondaryColumn,
} from "@/components/accounts/types";
import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
import type { BrokerageBalance } from "@/lib/brokerage/types";
import { formatUsd } from "@/lib/format";
import { walletTotal } from "@/lib/portfolio/asset-totals";
import type { BalancesResult, InvestmentBalance } from "@/lib/portfolio/types";

export const WALLET_SECONDARY_COLUMN: SecondaryColumn = {
  header: "Chain",
  align: "left",
};

export const BROKERAGE_SECONDARY_COLUMN: SecondaryColumn = {
  header: "Cost Basis",
  align: "right",
  mobileLabel: "Cost",
};

function shortenAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function statusMessage(result: BalancesResult): string {
  switch (result.status) {
    case "indexing":
      return "Indexing...";
    case "rate_limited":
      return "Rate limited. Wait a moment before reloading.";
    case "error":
      return result.message;
    case "ready":
      return "No balances.";
  }
}

function investmentRowKey(balance: InvestmentBalance, i: number): string {
  return balance.sourceBalanceId
    ? `${balance.chainId}:${balance.sourceBalanceId}`
    : `${balance.symbol}-${balance.chainId}-${i}`;
}

function brokerageRowKey(balance: BrokerageBalance, i: number): string {
  return balance.sourceBalanceId ?? `${balance.symbol}-${i}`;
}

function formatCostBasis(value: number | undefined): string {
  return value === undefined ? "—" : formatUsd(value);
}

// Closed positions are still reported by some sources (e.g. Schwab) with a zero
// quantity. They carry no value and only clutter the table, so drop them while
// keeping non-zero holdings — including negative (short) positions.
function hasBalance(balance: { amount: number }): boolean {
  return balance.amount !== 0;
}

/**
 * Normalize on-chain / exchange balance results into display groups. Ready-but-
 * empty addresses are dropped (nothing worth showing); non-ready addresses are
 * kept so their status copy still surfaces.
 */
export function balancesResultsToGroups(
  results: BalancesResult[],
): BalanceGroup[] {
  return results
    .filter(
      (result) =>
        !(result.status === "ready" && result.balances.length === 0),
    )
    .map((result, idx) => {
      const balances = (
        result.status === "ready" ? result.balances : []
      ).filter(hasBalance);
      const rows: BalanceRow[] = balances.map((balance, i) => ({
        key: investmentRowKey(balance, i),
        symbol: balance.symbol,
        secondary: balance.chainId,
        amount: balance.amount,
        priceUsd: balance.priceUsd,
        valueUsd: balance.valueUsd,
      }));

      return {
        key: `${result.address}-${idx}`,
        title: shortenAddress(result.address),
        rows,
        total: walletTotal(result),
        emptyMessage:
          result.status === "ready" ? undefined : statusMessage(result),
      };
    });
}

/**
 * Normalize brokerage accounts into display groups. Accounts with no holdings
 * are shown only when they failed to sync (so the error surfaces); otherwise
 * they are dropped.
 */
export function brokerageAccountsToGroups(
  accounts: CurrentBrokerageAccount[],
): BalanceGroup[] {
  return accounts
    .map((account) => ({
      account,
      balances: account.balances.filter(hasBalance),
    }))
    .filter(
      ({ account, balances }) =>
        balances.length > 0 || account.syncStatus === "error",
    )
    .map(({ account, balances }) => {
      const institution = account.institutionName ?? account.brokerage;
      const label = account.label ?? institution;
      const subtitle = institution !== label ? institution : undefined;
      const rows: BalanceRow[] = balances.map((balance, i) => ({
        key: brokerageRowKey(balance, i),
        symbol: balance.symbol,
        secondary: formatCostBasis(balance.costBasisUsd),
        amount: balance.amount,
        priceUsd: balance.priceUsd,
        valueUsd: balance.valueUsd,
      }));

      return {
        key: account.id,
        title: label,
        subtitle,
        rows,
        total: balances.reduce((sum, balance) => sum + balance.valueUsd, 0),
        emptyMessage:
          balances.length === 0
            ? account.syncStatus === "error"
              ? (account.syncErrorMessage ?? "Sync failed.")
              : "No holdings. Refresh to load."
            : undefined,
      };
    });
}
