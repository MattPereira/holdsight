import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { LoginForm } from "@/components/auth/login-form";
import { PlansProvider } from "@/components/portfolio/plans-context";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getCurrentSession, getCurrentUserId } from "@/lib/auth/session";
import { getSwitchableUsers } from "@/lib/auth/switchable-users";
import {
  HIDDEN_AMOUNTS_COOKIE,
  isHiddenAmountsValue,
} from "@/lib/hidden-amounts";
import { getUserPlans } from "@/lib/portfolio/plans";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Privacy-first: nothing renders until we know who the user is. The session is
  // resolved on the server so unauthenticated visitors never receive app data.
  const session = await getCurrentSession();

  if (!session) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <LoginForm />
        </div>
      </div>
    );
  }

  // Everything below renders the *effective* user: while View As is active the
  // sidebar is the only signal that the numbers on screen are not your own, so
  // it must never show the signed-in user's name instead.
  const [effectiveUserId, users] = await Promise.all([
    getCurrentUserId(),
    getSwitchableUsers(),
  ]);
  const activeUser =
    users.find((user) => user.id === effectiveUserId) ?? session.user;

  const plans = await getUserPlans(activeUser.id);
  // The root layout already applied the mask; the sidebar needs the same value
  // so its menu item opens with the label that matches what is on screen.
  const cookieStore = await cookies();
  const hiddenAmounts = isHiddenAmountsValue(
    cookieStore.get(HIDDEN_AMOUNTS_COOKIE)?.value,
  );

  return (
    <SidebarProvider>
      <PlansProvider initialPlans={plans}>
        <AppSidebar
          name={activeUser.name}
          email={activeUser.email}
          hiddenAmounts={hiddenAmounts}
          users={users}
          activeUserId={activeUser.id}
        />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <div className="p-6 md:p-10">{children}</div>
        </SidebarInset>
      </PlansProvider>
    </SidebarProvider>
  );
}
