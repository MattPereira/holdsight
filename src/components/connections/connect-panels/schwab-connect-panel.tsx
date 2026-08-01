"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RiDeleteBinLine, RiLineChartLine } from "@remixicon/react";

import {
  removeSchwabConnection,
  type SchwabConnectionSummary,
} from "@/app/(app)/connections/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
const statusLabel: Record<SchwabConnectionSummary["status"], string> = {
  active: "Connected",
  login_required: "Reconnect required",
  error: "Sync error",
  disabled: "Disabled",
};

export function SchwabConnectPanel({
  initialConnections,
  configured,
  view = "add",
}: {
  initialConnections: SchwabConnectionSummary[];
  configured: boolean;
  view?: "add" | "remove";
}) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, startRemoving] = useTransition();

  function handleRemove(connectionId: string): void {
    setError(null);
    startRemoving(async () => {
      const result = await removeSchwabConnection(connectionId);
      setConnections(result.schwabConnections);
      setError(result.error);
      if (!result.error) router.refresh();
    });
  }

  if (view === "remove") {
    if (connections.length === 0) return null;

    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Schwab</h3>
        <FieldError>{error}</FieldError>
        <ul className="divide-y rounded-lg border">
          {connections.map((connection) => {
            const name = connection.institutionName ?? "Charles Schwab";
            return (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <RiLineChartLine className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Trader API
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant={
                      connection.status === "active"
                        ? "secondary"
                        : connection.status === "disabled"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {statusLabel[connection.status]}
                  </Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${name}`}
                        disabled={isRemoving}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This deletes the stored Schwab authorization and any
                          synced brokerage data for this connection. You can
                          reconnect later, but this can&apos;t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(connection.id)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <FieldDescription>
        Connect directly with Schwab Trader API. You&apos;ll be redirected to
        Schwab to authorize access.
      </FieldDescription>
      <FieldError>{configured ? error : "Schwab is not configured."}</FieldError>
      <Button asChild size="lg" aria-disabled={!configured}>
        <a
          href={configured ? "/schwab/oauth/start" : "#"}
          onClick={(event) => {
            if (!configured) event.preventDefault();
          }}
        >
          <RiLineChartLine data-icon="inline-start" />
          Continue to Schwab
        </a>
      </Button>
    </div>
  );
}
