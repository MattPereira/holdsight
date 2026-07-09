"use client";

import { useState, type ReactNode } from "react";

import { TransactionJournalForm } from "@/components/accounts/transactions/transaction-journal-form";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

/**
 * Owns which transaction (if any) is selected for journaling, and swaps
 * between the caller's list and the journal form in place. Shared by every
 * consumer of `TransactionsTable` so the list<->form swap and its Back
 * behavior can't drift between them.
 */
export function TransactionJournalSwitcher({
  children,
  onBack,
}: {
  children: (
    selectTransaction: (transaction: InvestmentTransactionListItem) => void,
  ) => ReactNode;
  onBack?: () => void;
}) {
  const [selected, setSelected] =
    useState<InvestmentTransactionListItem | null>(null);

  if (selected) {
    return (
      <TransactionJournalForm
        transaction={selected}
        onBack={() => {
          setSelected(null);
          onBack?.();
        }}
      />
    );
  }

  return <>{children(setSelected)}</>;
}
