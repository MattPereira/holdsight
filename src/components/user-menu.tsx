"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    await authClient.signOut();
    router.refresh();
  }

  return (
    <div className="flex justify-between items-center gap-3 w-full">
      <div className="font-semibold text-xl">Holdsight</div>
      <div className="flex gap-3 items-center">
        <div className="text-right leading-tight">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={handleSignOut}
          disabled={isPending}
        >
          {isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </div>
  );
}
