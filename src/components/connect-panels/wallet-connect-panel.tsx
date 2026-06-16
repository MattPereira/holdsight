"use client";

import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
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
import type { SavedEvmAccount } from "@/lib/evm/accounts";

function shortenAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectPanel({
  initialWallets,
  onConnected,
}: {
  initialWallets: SavedEvmAccount[];
  onConnected: () => void;
}) {
  const router = useRouter();
  const [wallets, setWallets] = useState(initialWallets);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await addWallets(input);
      setWallets(result.wallets);
      setError(result.error);
      if (!result.error) {
        setInput("");
        // Close on a successful add; the page refresh surfaces new balances.
        onConnected();
      }
    });
  }

  function handleRemove(address: string) {
    startTransition(async () => {
      const result = await removeWallet(address);
      setWallets(result.wallets);
      setError(result.error);
      // Removal keeps the sheet open so several can be pruned in a row.
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Add accounts</h3>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
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
                Paste addresses separated by spaces or commas
              </FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Remove accounts</h3>
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
    </div>
  );
}
