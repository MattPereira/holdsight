import { FatalError } from "workflow";
import { sleep } from "workflow";

import { getUserBrokerageAccounts } from "@/lib/brokerage/accounts";
import { processBrokerageTransactionSyncPage } from "@/lib/brokerage/transactions";
import {
  failInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease,
  renewInvestmentTransactionSyncLease,
} from "@/lib/investment-transactions/ingestion";

const PLAID_REQUEST_INTERVAL = "3s";
const PLAID_PROVIDER = "plaid";

type BrokerageWorkflowAccount = {
  id: string;
  leaseToken: string;
};

async function processPage(
  userId: string,
  accountId: string,
  plaidItemId: string,
  leaseToken: string,
) {
  "use step";

  const hasLease = await renewInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: PLAID_PROVIDER,
    leaseToken,
  });
  if (!hasLease) throw new FatalError("Brokerage transaction sync lease was lost.");

  const account = (await getUserBrokerageAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account || account.plaidItemId !== plaidItemId) return null;

  return processBrokerageTransactionSyncPage({ userId, account });
}

async function releaseLease(
  userId: string,
  accountId: string,
  leaseToken: string,
) {
  "use step";

  await releaseInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider: PLAID_PROVIDER,
    leaseToken,
  });
}

async function failLease(input: {
  userId: string;
  accountId: string;
  leaseToken: string;
  message: string;
}) {
  "use step";

  await failInvestmentTransactionSyncLease({
    userId: input.userId,
    investmentAccountId: input.accountId,
    provider: PLAID_PROVIDER,
    leaseToken: input.leaseToken,
    message: input.message,
  });
}

async function failAccounts(
  userId: string,
  accounts: BrokerageWorkflowAccount[],
  message: string,
) {
  for (const account of accounts) {
    await failLease({
      userId,
      accountId: account.id,
      leaseToken: account.leaseToken,
      message,
    });
  }
}

/** Processes one Plaid Item sequentially so its requests stay below the per-Item limit. */
export async function syncBrokerageTransactionHistory(
  userId: string,
  plaidItemId: string,
  accounts: BrokerageWorkflowAccount[],
) {
  "use workflow";

  let totalTransactions = 0;
  let hasFetchedPage = false;
  const pendingAccounts = [...accounts];

  try {
    for (const account of accounts) {
      let accountClosed = false;
      while (true) {
        if (hasFetchedPage) await sleep(PLAID_REQUEST_INTERVAL);

        const result = await processPage(
          userId,
          account.id,
          plaidItemId,
          account.leaseToken,
        );
        if (!result) {
          await failLease({
            userId,
            accountId: account.id,
            leaseToken: account.leaseToken,
            message:
              "Brokerage account no longer exists or is no longer linked to this Plaid item.",
          });
          pendingAccounts.shift();
          accountClosed = true;
          break;
        }

        hasFetchedPage = true;
        totalTransactions += result.transactionCount;
        if (result.itemSyncStatus) {
          await releaseLease(userId, account.id, account.leaseToken);
          pendingAccounts.shift();
          accountClosed = true;
          await failAccounts(
            userId,
            pendingAccounts,
            `Brokerage transaction sync stopped: ${result.itemSyncStatus}.`,
          );
          return { plaidItemId, totalTransactions, status: result.itemSyncStatus };
        }
        if (!result.shouldContinue) break;
      }
      if (!accountClosed) {
        await releaseLease(userId, account.id, account.leaseToken);
        pendingAccounts.shift();
      }
    }

    return { plaidItemId, totalTransactions, status: "success" as const };
  } catch (error) {
    await failAccounts(
      userId,
      pendingAccounts,
      error instanceof Error
        ? error.message
        : "Brokerage transaction sync failed.",
    );
    throw error;
  }
}
