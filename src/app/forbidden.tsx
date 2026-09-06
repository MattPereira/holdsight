import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * What a 403 from `forbidden()` renders. Every refusal in the app is the same
 * situation — a member reached a change only the account's owner or an admin
 * may make (ADR 0005) — so it says that plainly instead of looking like a
 * crash. The session is fine; only this action was refused.
 */
export default function Forbidden() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Not your account to change</CardTitle>
          <CardDescription>
            You can view and refresh this account, but only its owner or an
            admin can change it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <Link href="/">Back to portfolio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
