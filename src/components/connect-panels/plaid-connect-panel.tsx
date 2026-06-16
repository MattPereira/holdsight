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
} from "@/app/actions";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { usePlaidConnect } from "@/components/use-plaid-connect";
import type { SavedPlaidItem } from "@/lib/plaid/items";

type AccountFamily = "checking" | "savings" | "credit_card" | "brokerage";

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
}: {
  initialItems: SavedPlaidItem[];
  onConnected: () => void;
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Add accounts</FieldLegend>
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

        <Button type="button" onClick={handleConnect} disabled={!canConnect}>
          {isConnecting ? "Connecting..." : "Continue to Plaid"}
        </Button>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-medium">Remove accounts</h3>
          <ul className="divide-y rounded-lg border">
            {items.map((item) => {
              const name = item.institutionName ?? "Connected institution";
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="truncate text-sm font-medium">{name}</span>
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
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
