import { sleep } from "workflow";

import {
  failInvestmentTransactionSyncLease,
  releaseInvestmentTransactionSyncLease,
  renewInvestmentTransactionSyncLease,
} from "@/lib/investment-transactions/ingestion";

export type TransactionSyncWorkflowAccount = {
  id: string;
  leaseToken: string;
};

export type TransactionSyncPageOutcome =
  | {
      transactionCount: number;
      shouldContinue: boolean;
      stopRemainingMessage?: string;
      status?: string;
    }
  | {
      missingAccountMessage: string;
    };

type RunSingleAccountTransactionSyncInput = {
  userId: string;
  accountId: string;
  leaseToken: string;
  provider: string;
  providerContext?: string;
  processPage: (
    userId: string,
    accountId: string,
    providerContext?: string,
  ) => Promise<TransactionSyncPageOutcome>;
  failureMessage: string;
  httpStatus?: (error: unknown) => number | null;
};

type RunSequentialAccountTransactionSyncInput = {
  userId: string;
  accounts: TransactionSyncWorkflowAccount[];
  provider: string;
  providerContext?: string;
  processPage: (
    userId: string,
    accountId: string,
    providerContext?: string,
  ) => Promise<TransactionSyncPageOutcome>;
  failureMessage: string;
  pageDelayMs?: number;
  httpStatus?: (error: unknown) => number | null;
};

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function releaseLease(
  userId: string,
  accountId: string,
  provider: string,
  leaseToken: string,
) {
  "use step";

  await releaseInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider,
    leaseToken,
  });
}

async function failLease(input: {
  userId: string;
  accountId: string;
  provider: string;
  leaseToken: string;
  message: string;
  httpStatus?: number | null;
}) {
  "use step";

  await failInvestmentTransactionSyncLease({
    userId: input.userId,
    investmentAccountId: input.accountId,
    provider: input.provider,
    leaseToken: input.leaseToken,
    message: input.message,
    httpStatus: input.httpStatus,
  });
}

async function failAccounts(
  userId: string,
  provider: string,
  accounts: TransactionSyncWorkflowAccount[],
  message: string,
  httpStatus?: number | null,
) {
  for (const account of accounts) {
    await failLease({
      userId,
      accountId: account.id,
      provider,
      leaseToken: account.leaseToken,
      message,
      httpStatus,
    });
  }
}

async function renewLease(
  userId: string,
  accountId: string,
  provider: string,
  leaseToken: string,
) {
  "use step";

  return renewInvestmentTransactionSyncLease({
    userId,
    investmentAccountId: accountId,
    provider,
    leaseToken,
  });
}

export async function runSingleAccountTransactionSync(
  input: RunSingleAccountTransactionSyncInput,
) {
  let totalTransactions = 0;

  try {
    while (true) {
      const hasLease = await renewLease(
        input.userId,
        input.accountId,
        input.provider,
        input.leaseToken,
      );
      if (!hasLease) {
        throw new Error(`${input.provider} transaction sync lease was lost.`);
      }

      const result = await input.processPage(
        input.userId,
        input.accountId,
        input.providerContext,
      );

      if ("missingAccountMessage" in result) {
        await failLease({
          userId: input.userId,
          accountId: input.accountId,
          provider: input.provider,
          leaseToken: input.leaseToken,
          message: result.missingAccountMessage,
        });
        return {
          accountId: input.accountId,
          totalTransactions,
          status: "missing_account" as const,
        };
      }

      totalTransactions += result.transactionCount;
      if (!result.shouldContinue) {
        await releaseLease(
          input.userId,
          input.accountId,
          input.provider,
          input.leaseToken,
        );
        return {
          accountId: input.accountId,
          totalTransactions,
          status: result.status ?? "success",
        };
      }
    }
  } catch (error) {
    await failLease({
      userId: input.userId,
      accountId: input.accountId,
      provider: input.provider,
      leaseToken: input.leaseToken,
      message: messageFor(error, input.failureMessage),
      httpStatus: input.httpStatus?.(error) ?? null,
    });
    throw error;
  }
}

export async function runSequentialAccountTransactionSync(
  input: RunSequentialAccountTransactionSyncInput,
) {
  let totalTransactions = 0;
  let hasFetchedPage = false;
  const pendingAccounts = [...input.accounts];

  try {
    for (const account of input.accounts) {
      let accountClosed = false;

      while (true) {
        if (hasFetchedPage && input.pageDelayMs) await sleep(input.pageDelayMs);

        const hasLease = await renewLease(
          input.userId,
          account.id,
          input.provider,
          account.leaseToken,
        );
        if (!hasLease) {
          throw new Error(`${input.provider} transaction sync lease was lost.`);
        }

        const result = await input.processPage(
          input.userId,
          account.id,
          input.providerContext,
        );

        if ("missingAccountMessage" in result) {
          await failLease({
            userId: input.userId,
            accountId: account.id,
            provider: input.provider,
            leaseToken: account.leaseToken,
            message: result.missingAccountMessage,
          });
          pendingAccounts.shift();
          accountClosed = true;
          break;
        }

        hasFetchedPage = true;
        totalTransactions += result.transactionCount;
        if (result.stopRemainingMessage) {
          await releaseLease(
            input.userId,
            account.id,
            input.provider,
            account.leaseToken,
          );
          pendingAccounts.shift();
          accountClosed = true;
          await failAccounts(
            input.userId,
            input.provider,
            pendingAccounts,
            result.stopRemainingMessage,
          );
          return {
            totalTransactions,
            status: result.status ?? "stopped",
          };
        }

        if (!result.shouldContinue) break;
      }

      if (!accountClosed) {
        await releaseLease(
          input.userId,
          account.id,
          input.provider,
          account.leaseToken,
        );
        pendingAccounts.shift();
      }
    }

    return { totalTransactions, status: "success" as const };
  } catch (error) {
    await failAccounts(
      input.userId,
      input.provider,
      pendingAccounts,
      messageFor(error, input.failureMessage),
      input.httpStatus?.(error) ?? null,
    );
    throw error;
  }
}
