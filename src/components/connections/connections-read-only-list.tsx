import type { AccountConnectionsResult } from "@/app/(app)/connections/actions";

type ConnectionEntry = {
  name: string;
  /** The one line of context the editable panel shows beside the name. */
  detail: string | null;
};

/**
 * What is connected to the account on screen, for a viewer the server would
 * refuse to let configure it.
 *
 * A flat listing rather than the connect panels in a disabled state: every
 * control on those panels is a mutation, so there is nothing left to disable —
 * only the fact of the connection is worth showing. Refresh and Transaction
 * History Sync are unaffected and stay on the portfolio pages (ADR 0005).
 */
export function ConnectionsReadOnlyList({
  connections,
}: {
  connections: AccountConnectionsResult;
}) {
  const groups: { label: string; items: ConnectionEntry[] }[] = [
    {
      label: "Plaid connections",
      items: connections.plaidItems.map((item) => ({
        name: item.institutionName ?? "Institution",
        detail: item.accountNames?.join(", ") ?? null,
      })),
    },
    {
      label: "Schwab",
      items: connections.schwabConnections.map((connection) => ({
        name: connection.institutionName ?? "Charles Schwab",
        detail: "Trader API",
      })),
    },
    {
      label: "Wallets",
      items: connections.wallets.map((wallet) => ({
        name: wallet.label ?? "Unnamed wallet",
        detail: wallet.address,
      })),
    },
    {
      label: "Kraken",
      items: connections.krakenAccounts.map((account) => ({
        name: account.label ?? "Kraken account",
        detail: null,
      })),
    },
    {
      label: "Lighter",
      items: connections.lighterAccounts.map((account) => ({
        name: account.label ?? "Lighter account",
        detail: account.address,
      })),
    },
    {
      label: "Manual items",
      items: connections.manualItems.map((item) => ({
        name: item.name,
        detail: item.symbol,
      })),
    },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts connected yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-3">
          <h3 className="text-base font-medium">{group.label}</h3>
          <ul className="divide-y rounded-lg border">
            {group.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex min-w-0 flex-col px-3 py-2"
              >
                <span className="truncate text-sm">{item.name}</span>
                {item.detail ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
