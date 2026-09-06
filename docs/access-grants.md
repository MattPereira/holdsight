# Access grants

Who may use a Holdsight instance is stored in `access_grants`, one row per normalized email (ADR 0005). Presence grants access; deleting the row revokes it on the next request. There is no management UI, invitation flow, or bootstrap endpoint — administration is manual SQL, run against the database with `psql` or Drizzle Studio (`pnpm db:studio`).

Emails must be stored lowercase and trimmed. A check constraint rejects anything else, because the lookup normalizes before comparing and a differently-cased row would silently never match.

## Roles

| Action | `admin` | `member` |
| --- | --- | --- |
| Read any granted account | yes | yes |
| Refresh / synchronize any granted account | yes | yes |
| Write, and manage connections and credentials | any granted account | own account only |

The database does not enforce that exactly one admin exists.

The matrix lives in `src/lib/auth/policy.ts` and nowhere else. Server code asks it through `src/lib/auth/authorize.ts`, which pairs the signed-in actor with the account currently being viewed; a refused mutation answers `403` rather than falling back to the actor's own account.

Enforced everywhere a request is scoped to an account: admission, revocation, account switching, the user-maintained investment records (Plans, Trade Journal Entries, journal images), and provider configuration — wallets, exchanges, brokerages, manual accounts, credentials, connections, and the Schwab OAuth and Plaid Link completions that create them.

Refreshing balances and starting a Transaction History Sync stay open to either role for either account: they re-read what a provider already holds. Only persisting something asks for write authority, so a member viewing the other account sees its connections and can bring them current, but cannot change what it syncs from.

MCP and other token-authenticated clients are outside all of this. Their identity is the token's subject; the View As cookie is a browser concern and never reaches them.

## Bootstrap a fresh database

Run this after migrations and **before** the first sign-in. Without it, no one can enroll: an unknown email is rejected at user creation.

```sql
insert into access_grants (email, role)
values (lower(btrim('operator@example.com')), 'admin');
```

## Grant a member

```sql
insert into access_grants (email, role)
values (lower(btrim('member@example.com')), 'member')
on conflict (email) do nothing;
```

## Promote or demote

```sql
update access_grants set role = 'admin' where email = lower(btrim('operator@example.com'));
```

## Revoke

```sql
delete from access_grants where email = lower(btrim('member@example.com'));
```

Revocation takes effect on that user's next request, including one with a live session: their existing session stops passing the grant check, so protected pages, account switching, reads, and writes all deny. It does not delete their data or their user row.

## Migrating an existing deployment

Migration `0047_backfill_access_grants` inserts every existing user as a `member`, so nobody loses access when the `ALLOWED_EMAILS` environment variable goes away. Order matters:

1. Run migrations to create and backfill the table.
2. Promote the operator's grant to `admin` with the statement above.
3. Deploy the database-backed authorization code.
4. Remove `ALLOWED_EMAILS` from the deployment environment.
