import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { PositionsDisplay } from "@/components/positions-display";
import { UserMenu } from "@/components/user-menu";
import { getLatestPositionSnapshots } from "@/lib/position-snapshots";

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

  const positionSnapshots = await getLatestPositionSnapshots(session.user.id);

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex items-center justify-end gap-4">
        <UserMenu name={session.user.name} email={session.user.email} />
      </header>
      <PositionsDisplay initialResults={positionSnapshots} />
    </div>
  );
}
