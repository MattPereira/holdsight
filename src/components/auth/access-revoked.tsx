"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { EMAIL_NOT_ALLOWED } from "@/lib/auth/access-error-code";
import { authErrorMessage } from "@/lib/auth/error-message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shown when a valid session no longer has an access grant. Signing out is the
 * only offer: the session itself is fine, so leaving it in place would just
 * bounce the user off this screen again.
 */
export function AccessRevoked() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const message = authErrorMessage(EMAIL_NOT_ALLOWED);

  async function handleSignOut() {
    setIsPending(true);
    await authClient.signOut();
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{message.title}</CardTitle>
        <CardDescription>{message.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={handleSignOut} disabled={isPending}>
          {isPending ? "Logging out…" : "Log out"}
        </Button>
      </CardContent>
    </Card>
  );
}
