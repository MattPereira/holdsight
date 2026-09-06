"use client";

import { createContext, useContext } from "react";

import type { ViewedAccountCapabilities } from "@/lib/auth/policy";

/**
 * What the signed-in user may do to the account currently on screen.
 *
 * The client gets the answer, never the rule: this is only enough to decide
 * whether to render a mutation control. Every action it guards is authorized
 * again on the server, so a stale or tampered value cannot grant anything.
 */
const ViewedAccountContext = createContext<ViewedAccountCapabilities | null>(
  null,
);

export function ViewedAccountProvider({
  capabilities,
  children,
}: {
  capabilities: ViewedAccountCapabilities;
  children: React.ReactNode;
}) {
  return (
    <ViewedAccountContext.Provider value={capabilities}>
      {children}
    </ViewedAccountContext.Provider>
  );
}

// No default value on purpose: a component that guesses "writable" would show a
// member controls the server is about to refuse.
export function useViewedAccount(): ViewedAccountCapabilities {
  const capabilities = useContext(ViewedAccountContext);
  if (!capabilities) {
    throw new Error(
      "useViewedAccount must be used within a ViewedAccountProvider",
    );
  }
  return capabilities;
}
