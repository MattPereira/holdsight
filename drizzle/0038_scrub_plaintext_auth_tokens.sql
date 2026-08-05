-- Existing OAuth tokens cannot be safely encrypted without loading the
-- application secret. Discard them; Better Auth repopulates encrypted access
-- and refresh tokens on the user's next provider sign-in.
UPDATE "account"
SET
  "access_token" = NULL,
  "refresh_token" = NULL,
  "id_token" = NULL
WHERE "provider_id" <> 'credential';
