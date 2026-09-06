import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { ViewingAsBanner } from "@/components/app-shell/viewing-as-banner";
import { AccessRevoked } from "@/components/auth/access-revoked";
import { LoginForm } from "@/components/auth/login-form";
import { PlansProvider } from "@/components/portfolio/plans-context";
import { ViewedAccountProvider } from "@/components/auth/viewed-account-context";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  authorizedViewedAccountId,
  getViewedAccountCapabilities,
} from "@/lib/auth/authorize";
import { getCurrentSession } from "@/lib/auth/session";
import { getGrantedUsers } from "@/lib/auth/granted-users";
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
  // sidebar and the header banner are the only signals that the numbers on
  // screen are not your own, so neither may show the signed-in user instead.
  const [effectiveUserId, users] = await Promise.all([
    authorizedViewedAccountId("read"),
    getGrantedUsers(),
  ]);
  const activeUser = users.find((user) => user.id === effectiveUserId);

  // A live session is not admission: the grant behind it can be deleted at any
  // time, and this is the request that notices.
  if (!activeUser) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <AccessRevoked />
      </div>
    );
  }

  const [plans, capabilities] = await Promise.all([
    getUserPlans(activeUser.id),
    // What the signed-in user may do *to this account* — a member looking at
    // the other one reads it without the controls that would be refused.
    getViewedAccountCapabilities(),
  ]);
  // The root layout already applied the mask; the sidebar needs the same value
  // so its menu item opens with the label that matches what is on screen.
  const cookieStore = await cookies();
  const hiddenAmounts = isHiddenAmountsValue(
    cookieStore.get(HIDDEN_AMOUNTS_COOKIE)?.value,
  );

  return (
    <SidebarProvider>
      <ViewedAccountProvider capabilities={capabilities}>
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
              <div className="ml-auto flex items-center gap-3">
                <ViewingAsBanner
                  viewingAs={
                    activeUser.id === session.user.id ? null : activeUser.name
                  }
                  canWrite={capabilities.canWrite}
                />
                <ThemeToggle />
              </div>
            </header>
            <div className="p-6 md:p-10">{children}</div>
          </SidebarInset>
        </PlansProvider>
      </ViewedAccountProvider>
    </SidebarProvider>
  );
}
