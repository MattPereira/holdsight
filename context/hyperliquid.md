# Hyperliquid / HyperCore Handoff

## Current State

The refresh button on the home page calls `loadPositions()` in `src/app/actions.ts`.
That action now syncs two data sources for each saved EVM wallet:

- Zerion EVM wallet positions.
- Hyperliquid HyperCore account state for the same wallet address, including
  spot balances, staking buckets, and perp positions.

HyperCore uses its own `financial_accounts.kind = "hyper_core"` records so provider
sync history stays separate from `evm_wallet` / Zerion data. The display layer merges
only HyperCore spot and staking holdings into the existing wallet holdings table.

## HyperCore Files

- `src/lib/hyperliquid.ts`
  - Server-only Hyperliquid API adapter.
  - Fetches:
    - `clearinghouseState` for perp account state and positions.
    - `spotClearinghouseState` for spot balances.
    - `spotMetaAndAssetCtxs` for spot prices.
    - `delegatorSummary` for staking holding buckets.
  - Normalizes spot, staking, and perp records into `HyperCorePosition`.

- `src/lib/hyper-core-accounts.ts`
  - Ensures each saved EVM wallet has a matching active HyperCore financial account.
  - Returns only HyperCore accounts that correspond to the current saved wallet set.

- `src/lib/hyper-core-snapshots.ts`
  - Saves HyperCore sync runs.
  - Saves normalized HyperCore spot, staking, and perp rows into
    `financial_account_positions`.
  - Saves perp-specific fields into `hyper_core_position_details`.
  - Saves account-level perp summary into `hyper_core_account_snapshots`.
  - Reads latest HyperCore spot/staking rows for merging into the existing holdings
    display.

## Database Work Already Done For Perps

The schema now has:

- `hyper_core_position_details`
  - `position_id`
  - `market`
  - `side`
  - `signed_size`
  - `entry_px`
  - `liquidation_px`
  - `margin_used`
  - `unrealized_pnl`
  - `return_on_equity`
  - `leverage_type`
  - `leverage_value`
  - `raw_leverage`

- `hyper_core_account_snapshots`
  - `sync_run_id`
  - `account_value`
  - `total_margin_used`
  - `total_ntl_pos`
  - `total_raw_usd`
  - `withdrawable`
  - `source_time`
  - `raw`

Perp rows are already inserted into `financial_account_positions` with:

- `asset_class = "derivative"`
- `source_position_id = "hypercore:perp:{coin}"`
- `symbol = "{coin}-PERP"`
- `name = "{coin} Perpetual"`
- signed `amount` from Hyperliquid `szi`
- derived `price_usd = abs(positionValue / szi)`
- `value_usd = positionValue`

Then the matching details row is inserted into `hyper_core_position_details`.

## Display Status

Perps are intentionally not displayed yet.

Current display behavior:

- Existing EVM positions still render normally.
- HyperCore spot and staking positions are merged into each wallet's existing
  holdings table with `chainId = "hypercore"`.
- HyperCore perps are saved in the DB but filtered out by the current read path because
  `getLatestHyperCoreSpotPositionsByAccountId()` only returns `assetClass` values
  `"token"` and `"cash"`.

## How To Pick Up Perp Display Later

Recommended next steps:

1. Add a perp-specific read function in `src/lib/hyper-core-snapshots.ts`.
   It should query the latest successful HyperCore sync run for a HyperCore account,
   select `financial_account_positions` where `asset_class = "derivative"`, and join
   `hyper_core_position_details`.

2. Add a type in `src/lib/types.ts`, for example:

   ```ts
   export type HyperCorePerpPosition = {
     sourcePositionId?: string;
     symbol: string;
     market: string;
     side: "long" | "short";
     signedSize: number;
     entryPx: number;
     markPx: number;
     positionValueUsd: number;
     marginUsedUsd: number;
     unrealizedPnlUsd: number;
     liquidationPx: number | null;
     leverageType: string | null;
     leverageValue: number | null;
   };
   ```

3. Return perps separately from spot holdings.
   Avoid forcing perps into the current `Position` display shape because perps need
   side, entry, liquidation, margin, and PnL columns.

4. Add a dedicated perps component.
   A practical first version:
   - Wallet/account accordion remains grouped by wallet address.
   - Existing holdings table stays as-is for EVM + HyperCore spot.
   - Add a separate `HyperCore Perps` table below holdings when perps exist.
   - Suggested columns: Market, Side, Size, Entry, Mark, Value, Margin, PnL,
     Liquidation, Leverage.

5. Consider showing `hyper_core_account_snapshots` above the perps table.
   Useful summary fields:
   - account value
   - withdrawable
   - total margin used
   - total notional position

## Migration

The generated migration is `drizzle/0002_clumsy_lorna_dane.sql`.

Before testing HyperCore sync against a database, run:

```bash
pnpm run db:migrate
```

After code changes, run:

```bash
pnpm run check
```

## Staked HYPE Decision

Staked HYPE should be handled as a separate HyperCore holding bucket, not merged
into spot HYPE at the raw data level.

Reason: Hyperliquid staking HYPE leaves the spot account, so it does not appear in
`spotClearinghouseState`. Hyperliquid staking docs describe staking as part of
HyperCore, and current staking info endpoints expose it separately through
`delegatorSummary` and `delegations`.

Fetch these during the current HyperCore holdings sync:

- `spotClearinghouseState`
  - Core spot balances.
- `spotMetaAndAssetCtxs`
  - Current HYPE mark/mid price for USD valuation.
- `delegatorSummary`
  - Total staking buckets:
    - `delegated`
    - `undelegated`
    - `totalPendingWithdrawal`
    - `nPendingWithdrawals`

Defer this until a validator breakdown UI exists:

- `delegations`
  - Validator-level active delegation records:
    - `validator`
    - `amount`
    - `lockedUntilTimestamp`

Do not rely on `delegatorRewards` for portfolio holdings. It is useful later for
history/yield reporting, but not needed for current holdings valuation.

### Normalized Holding Strategy

Add staked HYPE as one or more HyperCore holdings with `assetClass = "token"` so
the value can appear in the existing holdings display, but with source ids that
make the bucket explicit:

- `hypercore:staking:hype:delegated`
- `hypercore:staking:hype:undelegated`
- `hypercore:staking:hype:pending-withdrawal`

Recommended display labels:

- `HYPE Staked`
- `HYPE`
- `HYPE Pending Unstake`

All should use:

- `chainId = "hypercore"`
- `priceUsd = HYPE spot mark/mid price from spot market data`
- `valueUsd = amount * priceUsd`

Symbols should distinguish the buckets in compact holdings views:

- delegated: `symbol = "sHYPE"`, `name = "HYPE Staked"`
- undelegated: `symbol = "HYPE"`, `name = "HYPE"`
- pending withdrawal: `symbol = "pHYPE"`, `name = "HYPE Pending Unstake"`

This keeps accounting clear while still allowing the current holdings table to
include the value.

### Total HYPE Semantics

For any future "total HYPE" summary, calculate:

```ts
totalHype =
  spotHype +
  Number(stakingSummary.delegated) +
  Number(stakingSummary.undelegated) +
  Number(stakingSummary.totalPendingWithdrawal);
```

Keep the display buckets separate even if a summary total combines them.

### Validator Details

The validator-level `delegations` response should not be squeezed into the generic
`financial_account_positions` table. Add a provider-specific detail table later,
similar to `hyper_core_position_details`, if we want validator breakdowns:

```txt
hyper_core_staking_delegations
  sync_run_id
  validator
  amount
  locked_until_timestamp
```

The first implementation can save just the summary-derived holding rows. Add
validator-level persistence when the UI needs a validator breakdown.
