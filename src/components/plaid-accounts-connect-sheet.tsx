"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiBankCardLine, RiBankLine, RiLineChartLine } from "@remixicon/react";

import {
  createPlaidAccountsLinkToken,
  linkPlaidAccounts,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePlaidConnect } from "@/components/use-plaid-connect";

type AccountFamily = "checking" | "savings" | "credit_card" | "brokerage";

const accountOptions: {
  family: AccountFamily;
  label: string;
  description: string;
  icon: typeof RiBankLine;
}[] = [
  {
    family: "checking",
    label: "Checking",
    description: "Cash balances for checking accounts.",
    icon: RiBankLine,
  },
  {
    family: "savings",
    label: "Savings",
    description: "Cash balances for savings accounts.",
    icon: RiBankLine,
  },
  {
    family: "credit_card",
    label: "Credit cards",
    description: "Balances, limits, due dates, statements, and APRs.",
    icon: RiBankCardLine,
  },
  {
    family: "brokerage",
    label: "Brokerage",
    description: "Investment holdings, retirement accounts, and cash.",
    icon: RiLineChartLine,
  },
];

export function PlaidAccountsConnectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [selectedFamilies, setSelectedFamilies] =
    useState<AccountFamily[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    onLinked: () => {
      onOpenChange(false);
      router.refresh();
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Connect Accounts</SheetTitle>
          <SheetDescription>
            Choose the account types to request from Plaid.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Account Types</FieldLegend>
              <FieldDescription>
                Holdsight will save only the selected supported account types.
              </FieldDescription>
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
                          <FieldDescription>
                            {option.description}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    </FieldLabel>
                  );
                })}
              </div>
              <FieldError>{error}</FieldError>
            </FieldSet>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={handleConnect} disabled={!canConnect}>
            {isConnecting ? "Connecting..." : "Continue to Plaid"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
