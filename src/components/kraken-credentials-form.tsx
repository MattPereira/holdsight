"use client";

import { RiKey2Line, RiSettings3Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveKrakenCredentials } from "@/app/actions";
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

export function KrakenCredentialsForm() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await saveKrakenCredentials({ apiKey, apiSecret });
      setMessage(result.message);
      setError(result.error);

      if (!result.error) {
        setApiKey("");
        setApiSecret("");
        router.refresh();
      }
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Kraken credentials"
        >
          <RiSettings3Line />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kraken credentials</SheetTitle>
          <SheetDescription>
            Connect your Kraken account to sync balances
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
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
                  Use a query-only Kraken API key. The secret is encrypted
                  before it is stored.
                </FieldDescription>
                <FieldError>{error}</FieldError>
              </Field>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isPending}>
                  <RiKey2Line data-icon="inline-start" />
                  Save and sync
                </Button>
                {message && !error ? (
                  <p className="text-sm text-muted-foreground">{message}</p>
                ) : null}
              </div>
            </FieldGroup>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
