import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { processHyperCoreTransactionSyncPage } from "@/lib/hyper-core/transactions";
import {
  runSingleAccountTransactionSync,
  type TransactionSyncPageOutcome,
} from "@/workflows/transaction-sync-runner";

const HYPERLIQUID_PROVIDER = "hyperliquid";

async function processPage(
  userId: string,
  accountId: string,
): Promise<TransactionSyncPageOutcome> {
  "use step";

  const account = (await getUserHyperCoreAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account) throw new Error("HyperCore account no longer exists.");

  const result = await processHyperCoreTransactionSyncPage({ userId, account });
  return {
    transactionCount: result.transactionCount,
    shouldContinue: result.shouldContinue,
    status: result.phase,
  };
}

/** Runs one durable HyperCore fills page at a time until its checkpoint is current. */
export async function syncHyperCoreTransactionHistory(
  userId: string,
  accountId: string,
  leaseToken: string,
) {
  "use workflow";

  return runSingleAccountTransactionSync({
    userId,
    accountId,
    leaseToken,
    provider: HYPERLIQUID_PROVIDER,
    processPage,
    failureMessage: "HyperCore transaction sync failed.",
  });
}
