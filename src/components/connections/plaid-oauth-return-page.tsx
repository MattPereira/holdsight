"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";

import { linkPlaidAccounts, type PlaidAccountsActionResult } from "@/app/(app)/connections/actions";
import {
  clearPlaidLinkSession,
  readPlaidLinkSession,
  savePlaidLinkError,
  type PlaidLinkSession,
} from "@/components/connections/use-plaid-connect";

function linkAccount(
  session: PlaidLinkSession,
  publicToken: string,
): Promise<PlaidAccountsActionResult> {
  return linkPlaidAccounts(publicToken, session.families);
}

export function PlaidOAuthReturnPage() {
  const router = useRouter();
  const [session] = useState<PlaidLinkSession | null>(() => readPlaidLinkSession());
  const [message, setMessage] = useState("Returning to Plaid...");
  const [isPending, startTransition] = useTransition();

  const returnTo = session?.returnTo ?? "/";

  const finish = useCallback(
    (error: string | null) => {
      if (session) savePlaidLinkError(error);
      clearPlaidLinkSession();
      router.replace(returnTo);
    },
    [returnTo, router, session],
  );

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken) => {
      if (!session) return;
      setMessage("Saving linked account...");
      startTransition(async () => {
        const result = await linkAccount(session, publicToken);
        finish(result.error);
      });
    },
    [finish, session],
  );

  const { open, ready } = usePlaidLink({
    token: session?.linkToken ?? null,
    onSuccess,
    onExit: () => finish("Plaid Link was closed before the account was linked."),
    receivedRedirectUri:
      typeof window === "undefined" ? undefined : window.location.href,
  });

  useEffect(() => {
    if (!session) {
      router.replace("/");
      return;
    }

    if (ready) open();
  }, [open, ready, router, session]);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Plaid</h1>
      <p className="text-sm text-muted-foreground">
        {!session
          ? "No Plaid session found. Returning..."
          : isPending
            ? "Saving linked account..."
            : message}
      </p>
    </div>
  );
}
