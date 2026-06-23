import { sleep } from "workflow";

import { getUserBrokerageAccounts } from "@/lib/brokerage/accounts";
import {
  completeBrokerageTransactionImport,
  processBrokerageTransactionSyncPage,
} from "@/lib/brokerage/transactions";

const PLAID_REQUEST_INTERVAL = "3s";

async function processPage(
  userId: string,
  accountId: string,
  plaidItemId: string,
) {
  "use step";

  const account = (await getUserBrokerageAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account || account.plaidItemId !== plaidItemId) return null;

  return processBrokerageTransactionSyncPage({ userId, account });
}

async function completeImport(input: {
  userId: string;
  plaidItemId: string;
  status: "success" | "rate_limited" | "error";
  error?: { message: string; httpStatus: number | null };
}) {
  "use step";

  await completeBrokerageTransactionImport(input);
}

/** Processes one Plaid Item sequentially so its requests stay below the per-Item limit. */
export async function syncBrokerageTransactionHistory(
  userId: string,
  plaidItemId: string,
  accountIds: string[],
) {
  "use workflow";

  let totalTransactions = 0;
  let hasFetchedPage = false;

  try {
    for (const accountId of accountIds) {
      while (true) {
        if (hasFetchedPage) await sleep(PLAID_REQUEST_INTERVAL);

        const result = await processPage(userId, accountId, plaidItemId);
        if (!result) break;

        hasFetchedPage = true;
        totalTransactions += result.transactionCount;
        if (result.itemSyncStatus) {
          await completeImport({
            userId,
            plaidItemId,
            status: result.itemSyncStatus,
          });
          return { plaidItemId, totalTransactions, status: result.itemSyncStatus };
        }
        if (!result.shouldContinue) break;
      }
    }

    await completeImport({ userId, plaidItemId, status: "success" });
    return { plaidItemId, totalTransactions, status: "success" as const };
  } catch (error) {
    await completeImport({
      userId,
      plaidItemId,
      status: "error",
      error: {
        message: error instanceof Error ? error.message : "Brokerage transaction sync failed.",
        httpStatus: null,
      },
    });
    throw error;
  }
}
