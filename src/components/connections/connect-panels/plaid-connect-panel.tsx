"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RiBankCardLine,
  RiBankLine,
  RiDeleteBinLine,
  RiLineChartLine,
} from "@remixicon/react";

import {
  createPlaidAccountsLinkToken,
  linkPlaidAccounts,
  removePlaidItem,
} from "@/app/(app)/connections/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { usePlaidConnect } from "@/components/connections/use-plaid-connect";
import type { PlaidConnectionSummary } from "@/app/(app)/connections/actions";

type AccountFamily = "checking" | "savings" | "credit_card" | "brokerage";

const statusLabel: Record<PlaidConnectionSummary["status"], string | null> = {
  active: "Syncing",
  login_required: "Reconnect required",
  error: "Sync error",
  disabled: "Disabled",
};

const accountOptions: {
  family: AccountFamily;
  label: string;
  icon: typeof RiBankLine;
}[] = [
  {
    family: "checking",
    label: "Checking",
    icon: RiBankLine,
  },
  {
    family: "savings",
    label: "Savings",
    icon: RiBankLine,
  },
  {
    family: "credit_card",
    label: "Credit cards",
    icon: RiBankCardLine,
  },
  {
    family: "brokerage",
    label: "Brokerage",
    icon: RiLineChartLine,
  },
];

export function PlaidConnectPanel({
  initialItems,
  onConnected,
  view = "add",
}: {
  initialItems: PlaidConnectionSummary[];
  onConnected: () => void;
  view?: "add" | "remove";
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedFamilies, setSelectedFamilies] = useState<AccountFamily[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, startRemoving] = useTransition();

  const selected = useMemo(
    () => new Set<AccountFamily>(selectedFamilies),
    [selectedFamilies],
  );

  const plaidFamilies = useMemo(
    () =>
      accountOptions
        .map((option) => option.family)
        .filter((family) => selected.has(family)),
    [selected],
  );

  const plaidConnect = usePlaidConnect({
    families: plaidFamilies,
    createLinkToken: () => createPlaidAccountsLinkToken(plaidFamilies),
    linkAccount: (publicToken) => linkPlaidAccounts(publicToken, plaidFamilies),
    onLinked: (result) => {
      if (!result.error) onConnected();
    },
    onError: setError,
  });

  const isConnecting = plaidConnect.isConnecting;
  const canConnect = plaidFamilies.length > 0 && !isConnecting;

  function toggleFamily(family: AccountFamily): void {
    setError(null);
    setSelectedFamilies((current) =>
      current.includes(family)
        ? current.filter((item) => item !== family)
        : [...current, family],
    );
  }

  function handleConnect(): void {
    if (!canConnect) {
      setError("Select at least one account type.");
      return;
    }

    plaidConnect.connect();
  }

  function handleRemove(plaidItemId: string): void {
    setError(null);
    startRemoving(async () => {
      const result = await removePlaidItem(plaidItemId);
      setItems(result.plaidItems);
      setError(result.error);
      // Removal keeps the sheet open so several can be pruned in a row.
      if (!result.error) router.refresh();
    });
  }

  if (view === "remove") {
    if (items.length === 0) return null;

    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Plaid</h3>
        <FieldError>{error}</FieldError>
        <ul className="divide-y rounded-lg border">
          {items.map((item) => {
            const name = item.institutionName ?? "Connected institution";
            const status = statusLabel[item.status];
            const accountNames =
              item.accountNames?.join(", ") || "No synced accounts";
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <RiBankLine className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {accountNames}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {status ? (
                    <Badge
                      variant={
                        item.status === "active"
                          ? "secondary"
                          : item.status === "disabled"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {status}
                    </Badge>
                  ) : null}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${name}`}
                        disabled={isRemoving}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This unlinks the institution and deletes all of its
                          synced accounts and balances — checking, savings,
                          credit cards, and brokerage. You can reconnect later,
                          but this can&apos;t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(item.id)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <FieldGroup>
        <FieldSet>
          <div data-slot="checkbox-group" className="flex flex-col gap-2">
            {accountOptions.map((option) => {
              const Icon = option.icon;
              const id = `plaid-account-family-${option.family}`;

              return (
                <FieldLabel key={option.family} htmlFor={id}>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={id}
                      checked={selected.has(option.family)}
                      onCheckedChange={() => toggleFamily(option.family)}
                      disabled={isConnecting}
                    />
                    <FieldContent>
                      <FieldTitle>
                        <Icon />
                        {option.label}
                      </FieldTitle>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              );
            })}
          </div>
          <FieldError>{error}</FieldError>
        </FieldSet>
      </FieldGroup>

      <Button
        type="button"
        size="lg"
        onClick={handleConnect}
        disabled={!canConnect}
      >
        {isConnecting ? "Connecting..." : "Continue to Plaid"}
      </Button>
    </div>
  );
}
