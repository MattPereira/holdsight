"use client";

import {
  RiAddLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiPencilLine,
} from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addWallets, removeWallet, renameWallet } from "@/app/(app)/connections/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
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
  view = "add",
}: {
  initialWallets: SavedEvmAccount[];
  onConnected: () => void;
  view?: "add" | "remove";
}) {
  const router = useRouter();
  const [wallets, setWallets] = useState(initialWallets);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await addWallets(address, label);
      setWallets(result.wallets);
      setError(result.error);
      if (!result.error) {
        setAddress("");
        setLabel("");
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

  function startEditing(walletId: string, currentLabel: string | null) {
    setEditingId(walletId);
    setDraftLabel(currentLabel ?? "");
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setDraftLabel("");
  }

  function handleRename(address: string) {
    startTransition(async () => {
      const result = await renameWallet(address, draftLabel);
      setWallets(result.wallets);
      setError(result.error);
      if (!result.error) {
        cancelEditing();
        router.refresh();
      }
    });
  }

  if (view === "remove") {
    if (wallets.length === 0) return null;

    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Wallets</h3>
        {error ? <FieldError>{error}</FieldError> : null}
        <ul className="divide-y rounded-lg border">
          {wallets.map((wallet) => {
            const isEditing = editingId === wallet.id;
            return (
              <li
                key={wallet.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                {isEditing ? (
                  <Input
                    value={draftLabel}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    placeholder='Label e.g. "Cold wallet"'
                    autoComplete="off"
                    aria-label={`Label for ${wallet.address}`}
                    disabled={isPending}
                    autoFocus
                    className="h-8"
                  />
                ) : (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {wallet.label ?? "Unnamed wallet"}
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {shortenAddress(wallet.address)}
                    </span>
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Save label"
                        onClick={() => handleRename(wallet.address)}
                        disabled={isPending || draftLabel.trim() === ""}
                      >
                        <RiCheckLine />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Cancel"
                        onClick={cancelEditing}
                        disabled={isPending}
                      >
                        <RiCloseLine />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${wallet.address}`}
                        onClick={() => startEditing(wallet.id, wallet.label)}
                        disabled={isPending}
                      >
                        <RiPencilLine />
                      </Button>
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
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const canSubmit = address.trim() !== "" && label.trim() !== "";

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <div className="flex flex-col gap-2">
            <Input
              id="wallet-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x..."
              autoComplete="off"
              aria-label="Wallet address"
              aria-invalid={Boolean(error)}
              disabled={isPending}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wallet-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder='Label e.g. "Cold wallet"'
                autoComplete="off"
                aria-label="Wallet label"
                aria-invalid={Boolean(error)}
                disabled={isPending}
              />
              <Button type="submit" disabled={isPending || !canSubmit}>
                <RiAddLine data-icon="inline-start" />
                Add
              </Button>
            </div>
          </div>
          <FieldDescription>
            Add one wallet address and a label to identify it
          </FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>
    </form>
  );
}
