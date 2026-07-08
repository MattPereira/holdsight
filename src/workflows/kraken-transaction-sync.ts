import {
  getUserKrakenAccounts,
} from "@/lib/exchange/kraken/accounts";
import {
  processKrakenTransactionSyncPage,
} from "@/lib/exchange/kraken/transactions";
import {
  runSingleAccountTransactionSync,
  type TransactionSyncPageOutcome,
} from "@/workflows/transaction-sync-runner";

const KRAKEN_PROVIDER = "kraken";

async function processPage(
  userId: string,
  accountId: string,
): Promise<TransactionSyncPageOutcome> {
  "use step";

  const account = (await getUserKrakenAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account) throw new Error("Kraken account no longer exists.");

  const result = await processKrakenTransactionSyncPage({ userId, account });
  return {
    transactionCount: result.transactionCount,
    shouldContinue: result.shouldContinue,
    status: result.phase,
  };
}

/** Runs one bounded Kraken page at a time until the durable checkpoint is current. */
export async function syncKrakenTransactionHistory(
  userId: string,
  accountId: string,
  leaseToken: string,
) {
  "use workflow";

  return runSingleAccountTransactionSync({
    userId,
    accountId,
    leaseToken,
    provider: KRAKEN_PROVIDER,
    processPage,
    failureMessage: "Kraken transaction sync failed.",
  });
}
