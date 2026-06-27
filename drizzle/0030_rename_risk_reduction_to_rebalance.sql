-- Custom SQL migration file, put your code below! --
-- Reason vocabulary moved from a Postgres enum to plain text validated in TS.
-- The "risk_reduction" reason was retired; position-sizing decisions now fall
-- under "rebalance", so legacy rows are reclassified accordingly.
UPDATE "investment_transaction_journal_entries"
SET "trade_reason" = 'rebalance'
WHERE "trade_reason" = 'risk_reduction';