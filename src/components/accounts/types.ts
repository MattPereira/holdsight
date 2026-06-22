/**
 * View models shared by the account details pages (wallets, exchanges,
 * brokerages). Each source maps its raw balances into these normalized shapes
 * so a single BalancesTable can render all three.
 */

export type SecondaryColumn = {
  // Header label for the source-specific second column (e.g. "Chain" for
  // on-chain wallets, "Cost Basis" for brokerages).
  header: string;
  align: "left" | "right";
  // Optional label used in the compact mobile row where the table header is not visible.
  mobileLabel?: string;
};

export type BalanceRow = {
  key: string;
  symbol: string;
  // Pre-formatted contents of the secondary column for this row.
  secondary: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
};

export type BalanceGroup = {
  key: string;
  // Primary identifier shown in the group header (address or account label).
  title: string;
  // Optional secondary identifier (e.g. institution name) shown opposite it.
  subtitle?: string;
  rows: BalanceRow[];
  total: number;
  // Shown in place of the table when the group has no rows (status / sync copy).
  emptyMessage?: string;
};
