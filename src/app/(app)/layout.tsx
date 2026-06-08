import { AppSidebar } from "@/components/app-sidebar";
import { LoginForm } from "@/components/login-form";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/auth/session";

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

  return (
    <SidebarProvider>
      <AppSidebar name={session.user.name} email={session.user.email} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
