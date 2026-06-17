"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiBankLine,
  RiCoinsLine,
  RiExchangeFundsLine,
  RiWalletLine,
} from "@remixicon/react";

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
  const [provider, setProvider] = useState<Provider>("plaid");

  // A successful connection sends the user back to the portfolio with fresh
  // data. This runs on a real page (not a modal), so Plaid Link's body-portaled
  // iframe isn't fighting a focus trap or pointer-event blocking.
  function handleConnected(): void {
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[20rem_1fr] lg:items-start lg:gap-12">
      {/* Left pane on desktop: page header + provider picker. */}
      <div className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-medium">Manage accounts</h1>
          <p className="text-sm text-muted-foreground">
            Connect or remove portfolio accounts
          </p>
        </div>

        <RadioGroup
          value={provider}
          onValueChange={(value) => setProvider(value as Provider)}
          className="gap-2"
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
      </div>

      {/* Right pane on desktop: the selected provider's form. */}
      <div className="flex flex-col">
        {connections.error ? (
          <p className="text-sm text-destructive">{connections.error}</p>
        ) : provider === "plaid" ? (
          <PlaidConnectPanel
            initialItems={connections.plaidItems}
            onConnected={handleConnected}
          />
        ) : provider === "wallet" ? (
          <WalletConnectPanel
            initialWallets={connections.wallets}
            onConnected={handleConnected}
          />
        ) : provider === "kraken" ? (
          <KrakenConnectPanel
            initialAccounts={connections.krakenAccounts}
            onConnected={handleConnected}
          />
        ) : (
          <ManualConnectPanel
            initialItems={connections.manualItems}
            onConnected={handleConnected}
          />
        )}
      </div>
    </div>
  );
}
