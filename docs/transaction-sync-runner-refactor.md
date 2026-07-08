# Transaction Sync Runner Refactor

## Goal

Keep Transaction History Sync asynchronous with Vercel Workflows, but reduce orchestration duplication and remove inline page processing from server actions.

## Decisions

- Server actions claim leases, enqueue workflows, revalidate paths, and return current DB snapshots.
- Server actions do not call provider page processors directly.
- Workflows remain the durable background runtime.
- Provider page processors remain responsible for one durable page: fetch, normalize, persist transactions, and update checkpoints.
- Shared workflow runner code owns repeated lease renewal, page loop, release, and failure handling.
- Provider workflow steps look up current account state from stable IDs before each page.
- UI behavior depends on DB transaction rows and `investment_transaction_syncs`, not workflow return values.

## Shape

Introduce shared workflow helpers for:

- `runSingleAccountTransactionSync`: Kraken, HyperCore, Lighter.
- `runSequentialAccountTransactionSync`: EVM wallets and Plaid item accounts.

Provider-specific adapters provide:

- provider name
- account lookup
- page processor
- missing-account behavior
- optional per-page delay/throttling
- failure metadata extraction, when needed

Plaid keeps item-level sequencing and pacing as provider-specific adapter behavior.

## Non-Goals

- Do not replace Vercel Workflows with a DB job queue.
- Do not rewrite provider checkpoint formats.
- Do not change normalized transaction schema.
- Do not change polling UX beyond making queue behavior consistent.

