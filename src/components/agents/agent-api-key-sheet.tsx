"use client";

import {
  RiDeleteBinLine,
  RiFileCopyLine,
  RiKey2Line,
  RiRefreshLine,
} from "@remixicon/react";
import { useEffect, useState, useTransition } from "react";

import {
  createAgentApiKey,
  getAgentApiKeys,
  revokeAgentApiKey,
  type AgentApiKeyView,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/sheet";

function formatDate(value: string | null): string {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AgentApiKeySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [keys, setKeys] = useState<AgentApiKeyView[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    startTransition(async () => {
      setError(null);
      const result = await getAgentApiKeys();
      setKeys(result.keys);
      if (result.error) setError(result.error);
    });
  }, [open]);

  function handleCreate() {
    setError(null);
    setSecret(null);
    setCopied(false);

    startTransition(async () => {
      const result = await createAgentApiKey(name);
      setKeys(result.keys);
      if (result.error) {
        setError(result.error);
        return;
      }

      setName("");
      setSecret(result.secret ?? null);
    });
  }

  function handleRevoke(keyId: string) {
    setError(null);

    startTransition(async () => {
      const result = await revokeAgentApiKey(keyId);
      setKeys(result.keys);
      if (result.error) setError(result.error);
    });
  }

  async function handleCopy() {
    if (!secret) return;

    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSecret(null);
          setCopied(false);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Manage agents</SheetTitle>
          <SheetDescription>
            Generate API keys for tools that refresh portfolio data.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="agent-key-name">Key name</FieldLabel>
              <Input
                id="agent-key-name"
                value={name}
                placeholder="Claude Desktop"
                disabled={isPending}
                aria-invalid={Boolean(error)}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleCreate();
                }}
              />
              <FieldDescription>
                Names help you identify where each key is used.
              </FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleCreate}
                disabled={isPending || name.trim().length === 0}
              >
                <RiKey2Line data-icon="inline-start" />
                Generate key
              </Button>
            </div>
          </FieldGroup>

          {secret ? (
            <section className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">New API key</h3>
                <p className="text-sm text-muted-foreground">
                  This key is shown once. Store it before closing the sheet.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={secret}
                  readOnly
                  className="font-mono text-xs"
                  aria-label="New agent API key"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  aria-label="Copy new API key"
                >
                  <RiFileCopyLine data-icon="inline-start" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Active keys</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh agent keys"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await getAgentApiKeys();
                    setKeys(result.keys);
                    if (result.error) setError(result.error);
                  })
                }
              >
                <RiRefreshLine />
              </Button>
            </div>

            {keys.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No agent keys yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {keys.map((key) => (
                  <li
                    key={key.id}
                    className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">
                          {key.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {key.keyPrefix}...
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Last used: {formatDate(key.lastUsedAt)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Revoke ${key.name}`}
                      disabled={isPending}
                      onClick={() => handleRevoke(key.id)}
                    >
                      <RiDeleteBinLine />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
