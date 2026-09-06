# Restrict instances to approved users

Holdsight deployments will be closed instances: access is default-deny, granted per email in the database `access_grants` table, and may cover a small group of trusted users. A grant carries one role. Any granted user may read, refresh, and synchronize every granted account; an `admin` may write every granted account, while a `member` may write only their own. Ownership of data stays separate — rows remain scoped to the user who owns them — but reading is shared, so a closed instance is a trusted group rather than a set of isolated tenants.

## Amendment: database grants replace the environment allowlist

Admission was originally configured through an `ALLOWED_EMAILS` environment variable, and every approved user was equally authorized. That could not express the operator/member split the instance needs, and could not be changed without a deployment. Grants now live in the database:

- A grant exists per normalized email and does not require a user row, so an instance can be bootstrapped before its first sign-in.
- User creation, session creation, and every protected render re-check the grant, so deleting a row revokes access immediately rather than at the next login.
- Account switching lists only granted users, and the authorization matrix is expressed once in `src/lib/auth/policy.ts`. Mutation sites are being moved onto it incrementally: Plans, Trade Journal Entries, and journal images check it now; provider configuration does not yet.

Grant administration is manual database work; see `docs/access-grants.md`.
