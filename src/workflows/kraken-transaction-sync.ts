import { FatalError } from "workflow";

import {
  getUserKrakenAccounts,
} from "@/lib/exchange/kraken/accounts";
import {
  processKrakenTransactionSyncPage,
} from "@/lib/exchange/kraken/transactions";

async function processPage(userId: string, accountId: string) {
  "use step";

  const account = (await getUserKrakenAccounts(userId)).find(
    (candidate) => candidate.id === accountId,
  );
  if (!account) throw new FatalError("Kraken account no longer exists.");

  return processKrakenTransactionSyncPage({ userId, account });
}

/** Runs one bounded Kraken page at a time until the durable checkpoint is current. */
export async function syncKrakenTransactionHistory(
  userId: string,
  accountId: string,
) {
  "use workflow";

  let totalTransactions = 0;
  while (true) {
    const result = await processPage(userId, accountId);
    totalTransactions += result.transactionCount;
    if (!result.shouldContinue) {
      return { accountId, totalTransactions, phase: result.phase };
    }
  }
}
