import { headers } from "next/headers";

import { LoginForm } from "@/components/login-form";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WalletManager } from "@/components/wallet-manager";
import { auth } from "@/lib/auth";
import { getUserWallets } from "@/lib/wallets";

export default async function WalletsPage() {
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

  const wallets = await getUserWallets(session.user.id);

  return (
    <SidebarProvider>
      <AppSidebar name={session.user.name} email={session.user.email} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-xl font-semibold">Wallets</h1>
        </header>
        <div className="flex flex-col gap-6 p-8">
          <WalletManager initialWallets={wallets} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
