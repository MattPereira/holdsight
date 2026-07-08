import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { processEvmTransactionSyncPage } from "@/lib/evm/transactions";
import {
  runSequentialAccountTransactionSync,
  type TransactionSyncPageOutcome,
  type TransactionSyncWorkflowAccount,
} from "@/workflows/transaction-sync-runner";

const ZERION_PROVIDER = "zerion";

async function processPage(
  userId: string,
  accountId: string,
): Promise<TransactionSyncPageOutcome> {
  "use step";
  const account = (await getUserEvmAccounts(userId)).find((candidate) => candidate.id === accountId);
  if (!account) throw new Error("EVM wallet no longer exists.");
  const result = await processEvmTransactionSyncPage({ userId, account });
  return {
    transactionCount: result.transactionCount,
    shouldContinue: result.shouldContinue,
  };
}

/** Coordinates EVM wallets sequentially so every Zerion call shares one quota. */
export async function syncEvmTransactionHistory(
  userId: string,
  accounts: TransactionSyncWorkflowAccount[],
) {
  "use workflow";

  return runSequentialAccountTransactionSync({
    userId,
    accounts,
    provider: ZERION_PROVIDER,
    processPage,
    failureMessage: "EVM transaction sync failed.",
  });
}
