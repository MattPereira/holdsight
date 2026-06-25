-- Custom SQL migration file, put your code below! --

-- Wallet accounts (EVM + HyperCore) never received a label; the human
-- identifier lives in the per-provider address tables. Backfill the label to a
-- shortened form of the address (0x1234…abcd) so existing wallets render an
-- identifier in the transactions UI. New wallets require a user-supplied label.

UPDATE "investment_accounts" AS ia
SET "label" = left(ewa."address", 6) || '…' || right(ewa."address", 4)
FROM "evm_wallet_accounts" AS ewa
WHERE ewa."investment_account_id" = ia."id"
  AND ia."kind" = 'evm_wallet'
  AND ia."label" IS NULL;
--> statement-breakpoint
UPDATE "investment_accounts" AS ia
SET "label" = left(hca."address", 6) || '…' || right(hca."address", 4)
FROM "hyper_core_accounts" AS hca
WHERE hca."investment_account_id" = ia."id"
  AND ia."kind" = 'hyper_core'
  AND ia."label" IS NULL;
