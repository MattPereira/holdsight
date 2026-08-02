/**
 * Shared number formatting for every surface that renders money or holdings.
 *
 * These live in one place so the same figure reads identically wherever it
 * appears, and so the distinction that matters for Hidden Amounts is legible at
 * the call site: `formatUsd` / `formatSignedUsd` / `formatCompactUsd` and the
 * quantity formatters all produce Sensitive Values, while `formatPrice` and
 * `formatPercent` do not.
 */

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Compact form for tight spaces such as the allocation donut center
// (e.g. "$182.1K").
const compactUsdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Sub-dollar prices keep enough significant digits that cheap tokens
// don't collapse to $0.00.
const subDollarPriceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 4,
});

const quantityFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

const exactQuantityFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "percent",
});

/** A USD value: balances, totals, transaction values. */
export function formatUsd(value: number): string {
  return usdFormat.format(value);
}

/** A USD value carrying an explicit direction, as used for realized PnL. */
export function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${usdFormat.format(Math.abs(value))}`;
}

/** A USD value abbreviated to fit a constrained space. */
export function formatCompactUsd(value: number): string {
  return compactUsdFormat.format(value);
}

/**
 * A per-unit asset price. Public market data, so this is not a Sensitive Value.
 */
export function formatPrice(value: number): string {
  return value !== 0 && Math.abs(value) < 1
    ? subDollarPriceFormat.format(value)
    : priceFormat.format(value);
}

/**
 * A held quantity of an asset, for dense listings where column tidiness wins
 * over precision. Sensitive: quantity times a public price reveals a balance.
 */
export function formatQuantity(value: number): string {
  return quantityFormat.format(value);
}

/**
 * A quantity shown on its own, where rounding would misreport the amount
 * actually moved — the legs of a single transaction.
 */
export function formatExactQuantity(value: number): string {
  return exactQuantityFormat.format(value);
}

/**
 * A share of a whole, expressed from a 0–1 ratio. Purely relative, so this is
 * not a Sensitive Value.
 */
export function formatPercent(ratio: number): string {
  return percentFormat.format(ratio);
}
