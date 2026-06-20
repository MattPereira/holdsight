"use client";

import { RiRefreshLine, RiRobot2Line, RiShieldCheckLine } from "@remixicon/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PublicOAuthClient = {
  client_name?: string;
  client_uri?: string;
};

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<OAuthConsentFallback />}>
      <OAuthConsentContent />
    </Suspense>
  );
}

function OAuthConsentContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id") ?? "";
  const scopes = searchParams.get("scope")?.split(" ").filter(Boolean) ?? [];
  const [client, setClient] = useState<PublicOAuthClient | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    void fetch(
      `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    )
      .then(async (response) => (response.ok ? response.json() : null))
      .then((result: PublicOAuthClient | null) => setClient(result))
      .catch(() => setClient(null));
  }, [clientId]);

  async function submitConsent(accept: boolean) {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accept,
          oauth_query: searchParams.toString(),
        }),
      });
      const result = (await response.json()) as {
        redirect_uri?: string;
        message?: string;
      };

      if (!response.ok || !result.redirect_uri) {
        throw new Error(result.message ?? "Unable to complete authorization.");
      }

      window.location.assign(result.redirect_uri);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to complete authorization.",
      );
      setIsPending(false);
    }
  }

  const agentName = client?.client_name?.trim() || "Unverified AI agent";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Badge variant="secondary">
            <RiRobot2Line data-icon="inline-start" />
            MCP connection request
          </Badge>
          <CardTitle className="mt-2">Connect {agentName} to Holdsight</CardTitle>
          <CardDescription>
            This agent is requesting access to your Holdsight MCP server. The
            agent name is supplied by the connecting application.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Connection target</h2>
            <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
              /api/mcp
            </p>
            {clientId ? (
              <p className="break-all text-xs text-muted-foreground">
                Client ID: {clientId}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">What this agent can do</h2>
            <ul className="flex flex-col gap-3 text-sm">
              <li className="flex gap-3">
                <RiShieldCheckLine className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Read portfolio allocations</span>
                  <span className="block text-muted-foreground">
                    View your current asset, group, and allocation data without
                    refreshing external accounts.
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <RiRefreshLine className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Refresh portfolio allocations</span>
                  <span className="block text-muted-foreground">
                    Refreshes connected accounts and may call your third-party
                    financial providers before returning updated data.
                  </span>
                </span>
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Authorization details</h2>
            <p className="text-sm text-muted-foreground">
              The agent receives a token for this MCP server and your Holdsight
              identity. Offline access lets it renew the connection for up to 30
              days without asking again.
            </p>
            <p className="text-xs text-muted-foreground">
              OAuth scopes: {scopes.length > 0 ? scopes.join(", ") : "openid"}
            </p>
          </section>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            disabled={isPending}
            onClick={() => void submitConsent(false)}
            variant="outline"
          >
            Deny
          </Button>
          <Button disabled={isPending} onClick={() => void submitConsent(true)}>
            {isPending ? "Connecting…" : "Allow connection"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

function OAuthConsentFallback() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Badge variant="secondary">
            <RiRobot2Line data-icon="inline-start" />
            MCP connection request
          </Badge>
          <CardTitle className="mt-2">Connect to Holdsight</CardTitle>
          <CardDescription>
            Loading authorization details.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
