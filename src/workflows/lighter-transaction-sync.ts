import { getUserLighterAccounts } from "@/lib/lighter/accounts";
import { processLighterTransactionSyncPage } from "@/lib/lighter/transactions";
import {
  runSingleAccountTransactionSync,
  type TransactionSyncPageOutcome,
} from "@/workflows/transaction-sync-runner";

function httpStatus(error: unknown): number | null {
  return error instanceof Error && "httpStatus" in error
    ? Number(error.httpStatus) || null
    : null;
}

async function processPage(
  userId: string,
  accountId: string,
): Promise<TransactionSyncPageOutcome> {
  "use step";
  const account = (await getUserLighterAccounts(userId)).find((item) => item.id === accountId);
  if (!account) throw new Error("Lighter account no longer exists.");
  const result = await processLighterTransactionSyncPage({ userId, account });
  return {
    transactionCount: result.transactionCount,
    shouldContinue: result.shouldContinue,
    status: result.phase,
  };
}

export async function syncLighterTransactionHistory(
  userId: string,
  accountId: string,
  leaseToken: string,
) {
  "use workflow";

  return runSingleAccountTransactionSync({
    userId,
    accountId,
    leaseToken,
    provider: "lighter",
    processPage,
    failureMessage: "Lighter transaction sync failed.",
    httpStatus,
  });
}
