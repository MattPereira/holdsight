"use client";

import { RiDeleteBinLine, RiKey2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeLighterConnection, saveLighterConnection } from "@/app/actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SavedEvmAccount } from "@/lib/evm/accounts";
import type { SavedLighterAccount } from "@/lib/lighter/accounts";

export function LighterConnectPanel({
  wallets,
  initialAccounts,
  onConnected,
  view = "add",
}: {
  wallets: SavedEvmAccount[];
  initialAccounts: SavedLighterAccount[];
  onConnected: () => void;
  view?: "add" | "remove";
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveLighterConnection({ evmInvestmentAccountId: walletId, readOnlyToken: token });
      setError(result.error);
      if (!result.error) {
        setToken("");
        onConnected();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeLighterConnection(id);
      setError(result.error);
      if (!result.error) {
        setAccounts((current) => current.filter((account) => account.id !== id));
        router.refresh();
      }
    });
  }

  if (view === "remove") {
    if (accounts.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Lighter</h3>
        <ul className="divide-y rounded-lg border">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-sm font-medium">
                {account.label ?? account.address} · account {account.accountIndex}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove Lighter account ${account.accountIndex}`} disabled={isPending}>
                    <RiDeleteBinLine />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Lighter account?</AlertDialogTitle>
                    <AlertDialogDescription>This removes its token and synced Lighter data without removing the EVM wallet.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(account.id)}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (wallets.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an EVM wallet before connecting Lighter.</p>;
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="lighter-wallet">EVM wallet</FieldLabel>
          <Select value={walletId} onValueChange={(value) => value && setWalletId(value)} disabled={isPending}>
            <SelectTrigger id="lighter-wallet"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              {wallets.map((wallet) => <SelectItem key={wallet.id} value={wallet.id}>{wallet.label ?? wallet.address}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="lighter-token">Lighter read-only token</FieldLabel>
          <Input id="lighter-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" disabled={isPending} aria-invalid={Boolean(error)} />
          <FieldDescription>Generate a canonical read-only token in Lighter. Add one connection for each main account or subaccount.</FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
        <Button type="submit" disabled={isPending || !walletId || !token.trim()}>
          <RiKey2Line data-icon="inline-start" />Save and sync
        </Button>
      </FieldGroup>
    </form>
  );
}
