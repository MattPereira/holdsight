import { FatalError } from "workflow";

import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { processEvmTransactionSyncPage } from "@/lib/evm/transactions";
import {
  failInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease,
  renewInvestmentTransactionSyncLease,
} from "@/lib/investment-transactions/ingestion";

const ZERION_PROVIDER = "zerion";

async function processPage(userId: string, accountId: string, leaseToken: string) {
  "use step";
  const hasLease = await renewInvestmentTransactionSyncLease({ userId, investmentAccountId: accountId, provider: ZERION_PROVIDER, leaseToken });
  if (!hasLease) throw new FatalError("EVM transaction sync lease was lost.");
  const account = (await getUserEvmAccounts(userId)).find((candidate) => candidate.id === accountId);
  if (!account) throw new FatalError("EVM wallet no longer exists.");
  return processEvmTransactionSyncPage({ userId, account });
}

async function release(userId: string, accountId: string, leaseToken: string) {
  "use step";
  await releaseInvestmentTransactionSyncLease({ userId, investmentAccountId: accountId, provider: ZERION_PROVIDER, leaseToken });
}

async function fail(userId: string, accountId: string, leaseToken: string, message: string) {
  "use step";
  await failInvestmentTransactionSyncLease({ userId, investmentAccountId: accountId, provider: ZERION_PROVIDER, leaseToken, message });
}

/** Coordinates EVM wallets sequentially so every Zerion call shares one quota. */
export async function syncEvmTransactionHistory(userId: string, accounts: Array<{ id: string; leaseToken: string }>) {
  "use workflow";
  for (const account of accounts) {
    try {
      while (true) {
        const result = await processPage(userId, account.id, account.leaseToken);
        if (!result.shouldContinue) break;
      }
      await release(userId, account.id, account.leaseToken);
    } catch (error) {
      await fail(userId, account.id, account.leaseToken, error instanceof Error ? error.message : "EVM transaction sync failed.");
      throw error;
    }
  }
}
