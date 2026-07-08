import { getUserBrokerageAccounts } from "@/lib/brokerage/accounts";
import { processBrokerageTransactionSyncPage } from "@/lib/brokerage/transactions";
import {
  runSequentialAccountTransactionSync,
  type TransactionSyncPageOutcome,
  type TransactionSyncWorkflowAccount,
} from "@/workflows/transaction-sync-runner";

const PLAID_REQUEST_INTERVAL_MS = 3_000;
const PLAID_PROVIDER = "plaid";

async function processPage(
  userId: string,
  accountId: string,
  plaidItemId?: string,
): Promise<TransactionSyncPageOutcome> {
  "use step";

  const account = (await getUserBrokerageAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account || account.plaidItemId !== plaidItemId) {
    return {
      missingAccountMessage:
        "Brokerage account no longer exists or is no longer linked to this Plaid item.",
    };
  }

  const result = await processBrokerageTransactionSyncPage({ userId, account });
  return {
    transactionCount: result.transactionCount,
    shouldContinue: result.shouldContinue,
    stopRemainingMessage: result.itemSyncStatus
      ? `Brokerage transaction sync stopped: ${result.itemSyncStatus}.`
      : undefined,
    status: result.itemSyncStatus ?? result.phase,
  };
}

/** Processes one Plaid Item sequentially so its requests stay below the per-Item limit. */
export async function syncBrokerageTransactionHistory(
  userId: string,
  plaidItemId: string,
  accounts: TransactionSyncWorkflowAccount[],
) {
  "use workflow";

  const result = await runSequentialAccountTransactionSync({
    userId,
    accounts,
    provider: PLAID_PROVIDER,
    providerContext: plaidItemId,
    processPage,
    failureMessage: "Brokerage transaction sync failed.",
    pageDelayMs: PLAID_REQUEST_INTERVAL_MS,
  });

  return { plaidItemId, ...result };
}
