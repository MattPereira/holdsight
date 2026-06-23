import { TransactionsTable } from "@/components/accounts/transactions/transactions-table";
import type { TransactionsPanel } from "@/components/accounts/transactions/types";
import { Button } from "@/components/ui/button";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

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

      {panel.historyStatus ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span>
            {panel.historyStatus.earliestTransactionAt && panel.historyStatus.latestTransactionAt
              ? `Loaded ${dateFormat.format(new Date(panel.historyStatus.earliestTransactionAt))} to ${dateFormat.format(new Date(panel.historyStatus.latestTransactionAt))}`
              : "No Kraken trades loaded yet."}
          </span>
          {panel.historyStatus.hasMore && panel.onLoadOlder ? (
            <Button type="button" size="sm" variant="outline" onClick={panel.onLoadOlder} disabled={panel.loadingOlder}>
              {panel.loadingOlder ? "Loading older trades" : "Load 50 older trades"}
            </Button>
          ) : panel.historyStatus.earliestTransactionAt ? (
            <span>Full available trade history loaded.</span>
          ) : null}
        </div>
      ) : null}

      <TransactionsTable transactions={panel.transactions} />
    </div>
  );
}
