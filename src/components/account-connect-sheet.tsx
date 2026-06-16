"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiBankLine,
  RiCoinsLine,
  RiExchangeFundsLine,
  RiWalletLine,
} from "@remixicon/react";

import {
  getAccountConnections,
  type AccountConnectionsResult,
} from "@/app/actions";
import { KrakenConnectPanel } from "@/components/connect-panels/kraken-connect-panel";
import { ManualConnectPanel } from "@/components/connect-panels/manual-connect-panel";
import { PlaidConnectPanel } from "@/components/connect-panels/plaid-connect-panel";
import { WalletConnectPanel } from "@/components/connect-panels/wallet-connect-panel";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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

export function AccountConnectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("plaid");
  const [connections, setConnections] =
    useState<AccountConnectionsResult | null>(null);

  // Lazy-load every connection list when the sheet opens so normal page loads
  // don't pay for these queries. Closing clears the data (see handleOpenChange)
  // so a reopen always refetches and shows the loading state.
  useEffect(() => {
    if (!open) return;

    let active = true;
    getAccountConnections().then((result) => {
      if (active) setConnections(result);
    });

    return () => {
      active = false;
    };
  }, [open]);

  function handleOpenChange(next: boolean): void {
    if (!next) setConnections(null);
    onOpenChange(next);
  }

  function handleConnected(): void {
    handleOpenChange(false);
    router.refresh();
  }

  const isLoading = connections === null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Manage accounts</SheetTitle>
          <SheetDescription>
            Connect or remove portfolio accounts
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
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

          {isLoading || !connections ? (
            <p className="text-sm text-muted-foreground">
              Loading connections…
            </p>
          ) : connections.error ? (
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
      </SheetContent>
    </Sheet>
  );
}
