import "server-only";

import { and, desc, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import {
  creditAccounts,
  type CreditAccountApr,
} from "@/db/schema/credit-accounts";
import type { PlaidCreditCardAccount } from "@/lib/credit-card/client";

const PLAID_PROVIDER = "plaid";

export type CreditCardAccountRow = {
  id: string;
  plaidItemId: string | null;
  externalAccountId: string | null;
  label: string | null;
  institutionName: string | null;
  accountMask: string | null;
  currency: string;
  currentBalance: number;
  availableCredit: number | null;
  creditLimit: number | null;
  minimumPaymentAmount: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  lastStatementIssueDate: string | null;
  lastStatementBalance: number | null;
  isOverdue: boolean | null;
  aprs: CreditAccountApr[];
  status: "active" | "disabled" | "error";
};

function amount(value: number | null): string | null {
  return value === null ? null : String(value);
}

function rowAmount(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Upsert the credit-card accounts under a Plaid Item. Matches existing rows by
 * Plaid account_id so a re-link or refresh updates the stored card data in
 * place rather than duplicating cards.
 */
export async function saveCreditCardAccounts(
  userId: string,
  plaidItemId: string,
  institutionName: string | null,
  accounts: PlaidCreditCardAccount[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const currentExternalAccountIds = accounts.map(
      (account) => account.externalAccountId,
    );

    await tx
      .delete(creditAccounts)
      .where(
        and(
          eq(creditAccounts.userId, userId),
          eq(creditAccounts.plaidItemId, plaidItemId),
          currentExternalAccountIds.length > 0
            ? notInArray(
                creditAccounts.externalAccountId,
                currentExternalAccountIds,
              )
            : undefined,
        ),
      );

    for (const account of accounts) {
      const [existing] = await tx
        .select({ id: creditAccounts.id })
        .from(creditAccounts)
        .where(
          and(
            eq(creditAccounts.userId, userId),
            eq(creditAccounts.externalAccountId, account.externalAccountId),
          ),
        )
        .limit(1);

      const values = {
        plaidItemId,
        institutionName,
        accountMask: account.mask,
        currency: account.currency,
        currentBalance: String(account.currentBalance),
        availableCredit: amount(account.availableCredit),
        creditLimit: amount(account.creditLimit),
        minimumPaymentAmount: amount(account.minimumPaymentAmount),
        nextPaymentDueDate: account.nextPaymentDueDate,
        lastPaymentAmount: amount(account.lastPaymentAmount),
        lastPaymentDate: account.lastPaymentDate,
        lastStatementIssueDate: account.lastStatementIssueDate,
        lastStatementBalance: amount(account.lastStatementBalance),
        isOverdue: account.isOverdue,
        aprs: account.aprs,
        status: "active" as const,
      };

      if (existing) {
        await tx
          .update(creditAccounts)
          .set(values)
          .where(eq(creditAccounts.id, existing.id));
        continue;
      }

      await tx.insert(creditAccounts).values({
        userId,
        provider: PLAID_PROVIDER,
        externalAccountId: account.externalAccountId,
        label: account.name,
        ...values,
      });
    }
  });
}

export async function getUserCreditCardAccounts(
  userId: string,
): Promise<CreditCardAccountRow[]> {
  const rows = await db
    .select({
      id: creditAccounts.id,
      plaidItemId: creditAccounts.plaidItemId,
      externalAccountId: creditAccounts.externalAccountId,
      label: creditAccounts.label,
      institutionName: creditAccounts.institutionName,
      accountMask: creditAccounts.accountMask,
      currency: creditAccounts.currency,
      currentBalance: creditAccounts.currentBalance,
      availableCredit: creditAccounts.availableCredit,
      creditLimit: creditAccounts.creditLimit,
      minimumPaymentAmount: creditAccounts.minimumPaymentAmount,
      nextPaymentDueDate: creditAccounts.nextPaymentDueDate,
      lastPaymentAmount: creditAccounts.lastPaymentAmount,
      lastPaymentDate: creditAccounts.lastPaymentDate,
      lastStatementIssueDate: creditAccounts.lastStatementIssueDate,
      lastStatementBalance: creditAccounts.lastStatementBalance,
      isOverdue: creditAccounts.isOverdue,
      aprs: creditAccounts.aprs,
      status: creditAccounts.status,
    })
    .from(creditAccounts)
    .where(
      and(
        eq(creditAccounts.userId, userId),
        eq(creditAccounts.status, "active"),
      ),
    )
    .orderBy(desc(creditAccounts.createdAt));

  return rows.map((row) => ({
    ...row,
    currentBalance: Number(row.currentBalance),
    availableCredit: rowAmount(row.availableCredit),
    creditLimit: rowAmount(row.creditLimit),
    minimumPaymentAmount: rowAmount(row.minimumPaymentAmount),
    lastPaymentAmount: rowAmount(row.lastPaymentAmount),
    lastStatementBalance: rowAmount(row.lastStatementBalance),
  }));
}
