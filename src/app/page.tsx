import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { PositionsDisplay } from "@/components/positions-display";
import { UserMenu } from "@/components/user-menu";

export default async function Home() {
  // Privacy-first: nothing renders until we know who the user is. The session is
  // resolved on the server so unauthenticated visitors never receive app data.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <LoginForm />
        </div>
      </div>
    );
  }

  // No data fetching here — the page renders instantly with zero Zerion calls.
  // Positions are fetched only when the user clicks the button in the panel.
  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Holdsight</h1>
        <UserMenu name={session.user.name} email={session.user.email} />
      </header>
      <PositionsDisplay />
    </div>
  );
}
