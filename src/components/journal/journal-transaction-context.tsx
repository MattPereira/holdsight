"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { JournalEntrySheet } from "@/components/accounts/transactions/journal-entry-sheet";
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
  const [editing, setEditing] = useState<InvestmentTransactionListItem | null>(
    null,
  );

  return (
    <>
      <TransactionsTable
        transactions={transactions}
        onEditJournal={setEditing}
        emptyMessage="No investment activity in this Journal Period."
        timeZone={homeTimezone}
      />

      <JournalEntrySheet
        transaction={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            router.refresh();
          }
        }}
      />
    </>
  );
}
