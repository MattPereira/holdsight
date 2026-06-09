"use client";

import { RiAddLine, RiDeleteBinLine, RiSettings3Line } from "@remixicon/react";
import { useState, useTransition } from "react";

import { addWallets, removeWallet } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SavedWallet } from "@/lib/evm/wallets";

function shortenAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletManager({
  initialWallets,
}: {
  initialWallets: SavedWallet[];
}) {
  const [wallets, setWallets] = useState(initialWallets);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await addWallets(input);
      setWallets(result.wallets);
      setMessage(result.message);
      setError(result.error);
      if (!result.error) setInput("");
    });
  }

  function handleRemove(address: string) {
    startTransition(async () => {
      const result = await removeWallet(address);
      setWallets(result.wallets);
      setMessage(result.message);
      setError(result.error);
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Manage wallets">
          <RiSettings3Line />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Wallets</SheetTitle>
          <SheetDescription>
            Add EVM wallet addresses to include them in your portfolio.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="wallet-addresses">
                  Wallet addresses
                </FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="wallet-addresses"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="0x..."
                    autoComplete="off"
                    aria-invalid={Boolean(error)}
                    disabled={isPending}
                  />
                  <Button type="submit" disabled={isPending}>
                    <RiAddLine data-icon="inline-start" />
                    Add
                  </Button>
                </div>
                <FieldDescription>
                  Paste one or more addresses separated by spaces, commas, or new
                  lines.
                </FieldDescription>
                <FieldError>{error}</FieldError>
              </Field>
            </FieldGroup>
          </form>

          {message && !error && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}

          {wallets.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {wallets.map((wallet) => (
                <li
                  key={wallet.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-mono text-sm">
                    <span className="sm:hidden">
                      {shortenAddress(wallet.address)}
                    </span>
                    <span className="hidden sm:inline">{wallet.address}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${wallet.address}`}
                    onClick={() => handleRemove(wallet.address)}
                    disabled={isPending}
                  >
                    <RiDeleteBinLine />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No wallets added yet.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
