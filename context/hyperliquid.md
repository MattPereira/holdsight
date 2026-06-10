# Hyperliquid / HyperCore Handoff

## Current State

The refresh button on the home page calls balance loading actions in
`src/app/actions.ts`.
That action now syncs two data sources for each saved EVM wallet:

- Zerion EVM wallet balances.
- Hyperliquid HyperCore balances for the same wallet address, including spot
  balances and staking buckets.

HyperCore uses its own `investment_accounts.kind = "hyper_core"` records so provider
sync history stays separate from `evm_wallet` / Zerion data. The display layer merges
only HyperCore spot and staking holdings into the existing wallet holdings table.

Perp fetching is intentionally deferred. When it is added, it should live in a
dedicated positions path, not in the HyperCore balances sync.

## HyperCore Files

- `src/lib/hyper-core/client.ts`
  - Server-only Hyperliquid API adapter.
  - Fetches:
    - `spotClearinghouseState` for spot balances.
    - `spotMetaAndAssetCtxs` for spot prices.
    - `delegatorSummary` for staking holding buckets.
  - Normalizes spot and staking records into `HyperCoreBalance`.

- `src/lib/hyper-core/accounts.ts`
  - Ensures each saved EVM wallet has a matching active HyperCore financial account.
  - Returns only HyperCore accounts that correspond to the current saved wallet set.

- `src/lib/hyper-core/balances.ts`
  - Saves normalized HyperCore spot and staking rows into `investment_balances`.
  - Saves provider-specific balance metadata into `hyper_core_balance_details`.
  - Reads HyperCore balances for display and for merging into portfolio totals.

## Database Shape For Future Perps

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

Current balance sync does not fetch or insert perps. When perp fetching is added,
the dedicated positions sync should insert rows into `investment_positions` with:

- `asset_class = "derivative"`
- `source_position_id = "hypercore:perp:{coin}"`
- `symbol = "{coin}-PERP"`
- `name = "{coin} Perpetual"`
- signed `amount` from Hyperliquid `szi`
- derived `price_usd = abs(positionValue / szi)`
- `value_usd = positionValue`

Then the matching details row should be inserted into
`hyper_core_position_details`.

## Display Status

Perps are intentionally not fetched or displayed yet.

Current display behavior:

- Existing EVM balances render normally.
- HyperCore spot and staking balances are merged into each wallet's existing
  holdings table with `chainId = "hypercore"`.
- HyperCore perps are deferred.

## How To Pick Up Perp Display Later

Recommended next steps:

1. Add a dedicated `src/lib/hyper-core/positions.ts`.
   It should fetch `clearinghouseState`, normalize derivative positions, insert
   `investment_positions` rows, and join/read `hyper_core_position_details`.

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

5. Consider adding a HyperCore account snapshot table and showing it above the
   perps table. Useful summary fields:
   - account value
   - withdrawable
   - total margin used
   - total notional position

## Migration

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

The validator-level `delegations` response should not be squeezed into
`investment_balances`. Add a provider-specific detail table later if we want
validator breakdowns:

```txt
hyper_core_staking_delegations
  sync_run_id
  validator
  amount
  locked_until_timestamp
```

The first implementation can save just the summary-derived holding rows. Add
validator-level persistence when the UI needs a validator breakdown.
