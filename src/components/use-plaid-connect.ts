import { useCallback, useEffect, useState, useTransition } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";

import type { PlaidLinkTokenActionResult } from "@/app/actions";

export type PlaidConnectPurpose = "brokerage" | "depository";

const PLAID_LINK_SESSION_STORAGE_KEY = "plaid_link_session";
const PLAID_LINK_ERROR_STORAGE_KEY_PREFIX = "plaid_link_error";

export type PlaidLinkSession = {
  purpose: PlaidConnectPurpose;
  linkToken: string;
  returnTo: string;
};

export function savePlaidLinkSession(session: PlaidLinkSession): void {
  localStorage.setItem(PLAID_LINK_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readPlaidLinkSession(): PlaidLinkSession | null {
  const raw = localStorage.getItem(PLAID_LINK_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PlaidLinkSession>;
    if (
      (parsed.purpose === "brokerage" || parsed.purpose === "depository") &&
      typeof parsed.linkToken === "string" &&
      typeof parsed.returnTo === "string"
    ) {
      return parsed as PlaidLinkSession;
    }
  } catch {
    /* malformed local state: clear below */
  }

  clearPlaidLinkSession();
  return null;
}

export function clearPlaidLinkSession(): void {
  localStorage.removeItem(PLAID_LINK_SESSION_STORAGE_KEY);
}

export function savePlaidLinkError(
  purpose: PlaidConnectPurpose,
  message: string | null,
): void {
  const key = `${PLAID_LINK_ERROR_STORAGE_KEY_PREFIX}:${purpose}`;
  if (message) localStorage.setItem(key, message);
  else localStorage.removeItem(key);
}

export function readPlaidLinkError(
  purpose: PlaidConnectPurpose,
): string | null {
  const key = `${PLAID_LINK_ERROR_STORAGE_KEY_PREFIX}:${purpose}`;
  const message = localStorage.getItem(key);
  localStorage.removeItem(key);
  return message;
}

/**
 * Drives one Plaid Link connect flow: fetch a link_token, open Plaid's UI, then
 * exchange the public_token server-side. Handles the OAuth redirect resume.
 * Shared by brokerage and checking; each page passes its own server actions.
 */
export function usePlaidConnect<TLinkedResult>({
  purpose,
  createLinkToken,
  linkAccount,
  onLinked,
  onError,
}: {
  purpose: PlaidConnectPurpose;
  createLinkToken: () => Promise<PlaidLinkTokenActionResult>;
  linkAccount: (
    publicToken: string,
  ) => Promise<TLinkedResult & { error: string | null }>;
  onLinked: (result: TLinkedResult) => void;
  onError: (message: string | null) => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onError(readPlaidLinkError(purpose));
  }, [onError, purpose]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken) => {
      setLinkToken(null);
      clearPlaidLinkSession();
      startTransition(async () => {
        const result = await linkAccount(publicToken);
        onError(result.error);
        onLinked(result);
      });
    },
    [linkAccount, onLinked, onError],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      setLinkToken(null);
      clearPlaidLinkSession();
    },
  });

  // Open once the token is set and the SDK is ready — covers both the normal
  // click flow and the automatic resume after an OAuth redirect.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const connect = useCallback(() => {
    onError(null);
    startTransition(async () => {
      const result = await createLinkToken();
      if (result.error || !result.linkToken) {
        onError(result.error ?? "Failed to start Plaid Link.");
        return;
      }
      // Persist before opening: an OAuth institution will navigate away and we
      // need this token back when the browser returns.
      savePlaidLinkSession({
        purpose,
        linkToken: result.linkToken,
        returnTo: window.location.pathname,
      });
      setLinkToken(result.linkToken);
    });
  }, [createLinkToken, onError, purpose]);

  return { connect, isPending, isConnecting: isPending || Boolean(linkToken) };
}
