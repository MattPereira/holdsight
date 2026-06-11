"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiAddLine,
  RiExpandUpDownLine,
  RiLogoutBoxRLine,
} from "@remixicon/react";

import {
  createBrokerageLinkToken,
  createDepositoryLinkToken,
  linkBrokerageAccount,
  linkDepositoryAccount,
} from "@/app/actions";
import { authClient } from "@/lib/auth/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePlaidConnect } from "@/components/use-plaid-connect";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function NavUser({ name, email }: { name: string; email: string }) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const brokerageConnect = usePlaidConnect({
    purpose: "brokerage",
    returnTo: "/brokerage",
    createLinkToken: createBrokerageLinkToken,
    linkAccount: linkBrokerageAccount,
    onLinked: () => {
      router.push("/brokerage");
      router.refresh();
    },
    onError: setConnectError,
  });

  const depositoryConnect = usePlaidConnect({
    purpose: "depository",
    returnTo: "/checking",
    createLinkToken: createDepositoryLinkToken,
    linkAccount: linkDepositoryAccount,
    onLinked: () => {
      router.push("/checking");
      router.refresh();
    },
    onError: setConnectError,
  });

  const isConnecting =
    brokerageConnect.isConnecting || depositoryConnect.isConnecting;

  async function handleSignOut() {
    setIsPending(true);
    await authClient.signOut();
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
              <RiExpandUpDownLine className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isConnecting}
              onSelect={() => brokerageConnect.connect()}
            >
              <RiAddLine />
              {isConnecting ? "Connecting..." : "Brokerage account"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isConnecting}
              onSelect={() => depositoryConnect.connect()}
            >
              <RiAddLine />
              {isConnecting ? "Connecting..." : "Checking account"}
            </DropdownMenuItem>
            {connectError ? (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1 text-xs text-destructive">
                  {connectError}
                </p>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={isPending}>
              <RiLogoutBoxRLine />
              {isPending ? "Logging out…" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
