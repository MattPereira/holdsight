import { FatalError } from "workflow";

import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { processHyperCoreTransactionSyncPage } from "@/lib/hyper-core/transactions";
import {
  failInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease,
  renewInvestmentTransactionSyncLease,
} from "@/lib/investment-transactions/ingestion";

const HYPERLIQUID_PROVIDER = "hyperliquid";

async function processPage(userId: string, accountId: string, leaseToken: string) {
  "use step";

  const hasLease = await renewInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: HYPERLIQUID_PROVIDER,
    leaseToken,
  });
  if (!hasLease) throw new FatalError("HyperCore transaction sync lease was lost.");

  const account = (await getUserHyperCoreAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account) throw new FatalError("HyperCore account no longer exists.");

  return processHyperCoreTransactionSyncPage({ userId, account });
}

async function releaseLease(userId: string, accountId: string, leaseToken: string) {
  "use step";

  await releaseInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: HYPERLIQUID_PROVIDER,
    leaseToken,
  });
}

async function markLeaseFailed(
  userId: string,
  accountId: string,
  leaseToken: string,
  message: string,
) {
  "use step";

  await failInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: HYPERLIQUID_PROVIDER,
    leaseToken,
    message,
  });
}

/** Runs one durable HyperCore fills page at a time until its checkpoint is current. */
export async function syncHyperCoreTransactionHistory(
  userId: string,
  accountId: string,
  leaseToken: string,
) {
  "use workflow";

  let totalTransactions = 0;
  try {
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
      error instanceof Error ? error.message : "HyperCore transaction sync failed.",
    );
    throw error;
  }
}
