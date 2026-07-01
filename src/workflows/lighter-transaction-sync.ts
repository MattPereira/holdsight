import { FatalError } from "workflow";

import { getUserLighterAccounts } from "@/lib/lighter/accounts";
import { processLighterTransactionSyncPage } from "@/lib/lighter/transactions";
import {
  failInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease,
  renewInvestmentTransactionSyncLease,
} from "@/lib/investment-transactions/ingestion";

async function processPage(userId: string, accountId: string, leaseToken: string) {
  "use step";
  const hasLease = await renewInvestmentTransactionSyncLease({
    userId, investmentAccountId: accountId, provider: "lighter", leaseToken,
  });
  if (!hasLease) throw new FatalError("Lighter transaction sync lease was lost.");
  const account = (await getUserLighterAccounts(userId)).find((item) => item.id === accountId);
  if (!account) throw new FatalError("Lighter account no longer exists.");
  return processLighterTransactionSyncPage({ userId, account });
}

async function releaseLease(userId: string, accountId: string, leaseToken: string) {
  "use step";

  await releaseInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: "lighter",
    leaseToken,
  });
}

async function markLeaseFailed(
  userId: string,
  accountId: string,
  leaseToken: string,
  message: string,
  httpStatus: number | null,
) {
  "use step";

  await failInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: "lighter",
    leaseToken,
    message,
    httpStatus,
  });
}

export async function syncLighterTransactionHistory(
  userId: string,
  accountId: string,
  leaseToken: string,
) {
  "use workflow";
  try {
    let totalTransactions = 0;
    while (true) {
      const result = await processPage(userId, accountId, leaseToken);
      totalTransactions += result.transactionCount;
      if (!result.shouldContinue) {
        await releaseLease(userId, accountId, leaseToken);
        return { accountId, totalTransactions, phase: result.phase };
      }
    }
  } catch (error) {
    await markLeaseFailed(
      userId,
      accountId,
      leaseToken,
      error instanceof Error ? error.message : "Lighter transaction sync failed.",
      error instanceof Error && "httpStatus" in error
        ? Number(error.httpStatus) || null
        : null,
    );
    throw error;
  }
}
