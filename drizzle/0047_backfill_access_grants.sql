-- Custom SQL migration file, put your code below! --

-- Admission moves from the ALLOWED_EMAILS environment variable to this table,
-- so every user who could sign in before must keep that ability. They are
-- backfilled as members; the operator promotes their own grant to admin by
-- hand (see docs/access-grants.md) before the environment variable is removed.
--
-- Derived from the user table on purpose: no personal email is committed here.

INSERT INTO "access_grants" ("email", "role")
SELECT DISTINCT lower(btrim("email")), 'member'::"access_role"
FROM "user"
WHERE char_length(btrim("email")) > 0
ON CONFLICT ("email") DO NOTHING;
