import type { AccountConnectionsResult } from "@/app/(app)/connections/actions";

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
  const groups: { label: string; items: string[] }[] = [
    {
      label: "Plaid connections",
      items: connections.plaidItems.map(
        (item) => item.institutionName ?? "Institution",
      ),
    },
    {
      label: "Schwab",
      items: connections.schwabConnections.map(
        (connection) => connection.institutionName ?? "Charles Schwab",
      ),
    },
    {
      label: "Wallets",
      items: connections.wallets.map(
        (wallet) => wallet.label ?? wallet.address,
      ),
    },
    {
      label: "Kraken",
      items: connections.krakenAccounts.map(
        (account) => account.label ?? "Kraken account",
      ),
    },
    {
      label: "Lighter",
      items: connections.lighterAccounts.map(
        (account) => account.label ?? account.address,
      ),
    },
    {
      label: "Manual items",
      items: connections.manualItems.map((item) => item.name),
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
              <li key={`${item}-${index}`} className="truncate px-3 py-2 text-sm">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
