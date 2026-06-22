import { TransactionsTable } from "@/components/accounts/transactions/transactions-table";
import type { CurrentBrokerageTransaction } from "@/lib/brokerage/transactions";

export type TransactionsPanel = {
  transactions: CurrentBrokerageTransaction[];
  onRefresh: () => void;
  busy: boolean;
  error: string | null;
  message: string | null;
};

export function TransactionsTabContent({
  panel,
}: {
  panel: TransactionsPanel;
}) {
  return (
    <div className="flex flex-col gap-4">
      {panel.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {panel.error}
        </p>
      ) : null}

      {panel.message ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {panel.message}
        </p>
      ) : null}

      <TransactionsTable transactions={panel.transactions} />
    </div>
  );
}
