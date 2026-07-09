"use client";

import { useRouter } from "next/navigation";

import { TransactionJournalSwitcher } from "@/components/accounts/transactions/transaction-journal-switcher";
import { TransactionsTable } from "@/components/accounts/transactions/transactions-table";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

export function JournalTransactionContext({
  transactions,
  homeTimezone,
}: {
  transactions: InvestmentTransactionListItem[];
  homeTimezone: string;
}) {
  const router = useRouter();

  return (
    <TransactionJournalSwitcher onBack={() => router.refresh()}>
      {(selectTransaction) => (
        <TransactionsTable
          transactions={transactions}
          onEditJournal={selectTransaction}
          emptyMessage="No investment activity in this Journal Period."
          timeZone={homeTimezone}
        />
      )}
    </TransactionJournalSwitcher>
  );
}
