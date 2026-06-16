"use client";

import { RiDeleteBinLine, RiKey2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeKrakenAccount, saveKrakenCredentials } from "@/app/actions";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SavedKrakenAccount } from "@/lib/exchange/kraken/accounts";

export function KrakenConnectPanel({
  initialAccounts,
  onConnected,
}: {
  initialAccounts: SavedKrakenAccount[];
  onConnected: () => void;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await saveKrakenCredentials({ apiKey, apiSecret });
      setError(result.error);

      if (!result.error) {
        setApiKey("");
        setApiSecret("");
        // Close on a successful connect; the page refresh surfaces balances.
        onConnected();
      }
    });
  }

  function handleRemove(investmentAccountId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeKrakenAccount(investmentAccountId);
      setError(result.error);
      // Removal keeps the sheet open so several can be pruned in a row.
      if (!result.error) {
        setAccounts((current) =>
          current.filter((account) => account.id !== investmentAccountId),
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Add accounts</h3>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="kraken-api-key">Kraken API key</FieldLabel>
              <Input
                id="kraken-api-key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                disabled={isPending}
                aria-invalid={Boolean(error)}
              />
            </Field>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="kraken-api-secret">Kraken secret</FieldLabel>
              <Input
                id="kraken-api-secret"
                type="password"
                value={apiSecret}
                onChange={(event) => setApiSecret(event.target.value)}
                autoComplete="off"
                disabled={isPending}
                aria-invalid={Boolean(error)}
              />
              <FieldDescription>
                API key must allow query permissions
              </FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>
            <Button type="submit" disabled={isPending}>
              <RiKey2Line data-icon="inline-start" />
              Save and sync
            </Button>
          </FieldGroup>
        </form>
      </div>

      {accounts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-medium">Remove accounts</h3>
          <ul className="divide-y rounded-lg border">
            {accounts.map((account) => {
              const name = account.label ?? account.exchange;
              return (
                <li
                  key={account.id}
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
                        disabled={isPending}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This deletes the stored API credentials and synced
                          balances for this exchange. You can reconnect later,
                          but this can&apos;t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(account.id)}
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
