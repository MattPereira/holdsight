"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiAddLine,
  RiArrowLeftLine,
  RiBankLine,
  RiCoinsLine,
  RiExchangeFundsLine,
  RiWalletLine,
} from "@remixicon/react";

import { Button } from "@/components/ui/button";

import type { AccountConnectionsResult } from "@/app/actions";
import { KrakenConnectPanel } from "@/components/connections/connect-panels/kraken-connect-panel";
import { ManualConnectPanel } from "@/components/connections/connect-panels/manual-connect-panel";
import { PlaidConnectPanel } from "@/components/connections/connect-panels/plaid-connect-panel";
import { WalletConnectPanel } from "@/components/connections/connect-panels/wallet-connect-panel";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Provider = "plaid" | "wallet" | "kraken" | "manual";

const providerOptions: {
  provider: Provider;
  label: string;
  description: string;
  icon: typeof RiBankLine;
}[] = [
  {
    provider: "plaid",
    label: "Plaid connection",
    description: "Tradfi institutional accounts",
    icon: RiBankLine,
  },
  {
    provider: "wallet",
    label: "EVM wallet",
    description: "Public account addresses",
    icon: RiWalletLine,
  },
  {
    provider: "kraken",
    label: "Kraken",
    description: "Read only api keys",
    icon: RiExchangeFundsLine,
  },
  {
    provider: "manual",
    label: "Manual item",
    description: "Other asset or liability accounts",
    icon: RiCoinsLine,
  },
];

export function AccountConnectView({
  connections,
}: {
  connections: AccountConnectionsResult;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"manage" | "add">("manage");
  const [provider, setProvider] = useState<Provider>("plaid");

  const hasConnections =
    connections.plaidItems.length > 0 ||
    connections.wallets.length > 0 ||
    connections.krakenAccounts.length > 0 ||
    connections.manualItems.length > 0;

  // A successful connection sends the user back to the portfolio with fresh
  // data. This runs on a real page (not a modal), so Plaid Link's body-portaled
  // iframe isn't fighting a focus trap or pointer-event blocking.
  function handleConnected(): void {
    router.push("/");
    router.refresh();
  }

  if (connections.error) {
    return <p className="text-sm text-destructive">{connections.error}</p>;
  }

  // Add flow: provider picker + the selected provider's add form. Reached from
  // the manage view's "Add account" action.
  if (mode === "add") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 self-start"
            onClick={() => setMode("manage")}
          >
            <RiArrowLeftLine data-icon="inline-start" />
            Back
          </Button>
          <h1 className="text-xl font-medium">Add an account</h1>
          <p className="text-sm text-muted-foreground">
            Choose how you want to connect
          </p>
        </div>

        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[20rem_1fr] lg:items-start lg:gap-12">
          <RadioGroup
            value={provider}
            onValueChange={(value) => setProvider(value as Provider)}
            className="gap-2 lg:sticky lg:top-6"
          >
            {providerOptions.map((option) => {
              const Icon = option.icon;
              const id = `account-provider-${option.provider}`;

              return (
                <FieldLabel key={option.provider} htmlFor={id}>
                  <Field orientation="horizontal">
                    <RadioGroupItem id={id} value={option.provider} />
                    <FieldContent>
                      <FieldTitle>
                        <Icon />
                        {option.label}
                      </FieldTitle>
                      <FieldDescription>{option.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              );
            })}
          </RadioGroup>

          <div className="flex flex-col">
            {provider === "plaid" ? (
              <PlaidConnectPanel
                view="add"
                initialItems={connections.plaidItems}
                onConnected={handleConnected}
              />
            ) : provider === "wallet" ? (
              <WalletConnectPanel
                view="add"
                initialWallets={connections.wallets}
                onConnected={handleConnected}
              />
            ) : provider === "kraken" ? (
              <KrakenConnectPanel
                view="add"
                initialAccounts={connections.krakenAccounts}
                onConnected={handleConnected}
              />
            ) : (
              <ManualConnectPanel
                view="add"
                initialItems={connections.manualItems}
                onConnected={handleConnected}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Manage flow (default): everything connected, grouped by provider, with an
  // "Add account" entry point. This is what a returning user wants most.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-medium">Connected accounts</h1>
          <p className="text-sm text-muted-foreground">
            Institutions, wallets, and items syncing to your portfolio
          </p>
        </div>
        <Button type="button" onClick={() => setMode("add")}>
          <RiAddLine data-icon="inline-start" />
          Add account
        </Button>
      </div>

      {hasConnections ? (
        <div className="flex flex-col gap-6">
          <PlaidConnectPanel
            view="remove"
            initialItems={connections.plaidItems}
            onConnected={handleConnected}
          />
          <WalletConnectPanel
            view="remove"
            initialWallets={connections.wallets}
            onConnected={handleConnected}
          />
          <KrakenConnectPanel
            view="remove"
            initialAccounts={connections.krakenAccounts}
            onConnected={handleConnected}
          />
          <ManualConnectPanel
            view="remove"
            initialItems={connections.manualItems}
            onConnected={handleConnected}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No accounts connected yet.
          </p>
          <Button type="button" onClick={() => setMode("add")}>
            <RiAddLine data-icon="inline-start" />
            Add your first account
          </Button>
        </div>
      )}
    </div>
  );
}
