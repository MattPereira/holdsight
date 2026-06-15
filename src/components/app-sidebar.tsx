"use client";

import Link from "next/link";
import {
  RiExchangeFundsLine,
  RiFundsLine,
  RiWalletLine,
} from "@remixicon/react";

import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const accounts = [
  { label: "Wallets", href: "/wallets", icon: RiWalletLine },
  { label: "Exchanges", href: "/exchanges", icon: RiExchangeFundsLine },
  { label: "Brokerages", href: "/brokerages", icon: RiFundsLine },
];

export function AppSidebar({
  name,
  email,
  allSymbols,
}: {
  name: string;
  email: string;
  allSymbols: string[];
}) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link
          href="/"
          className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left leading-tight"
        >
          <span className="truncate font-anta text-2xl font-medium">
            Holdsight
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {accounts.map((account) => (
              <SidebarMenuItem key={account.label}>
                <SidebarMenuButton
                  asChild
                  size="lg"
                  tooltip={account.label}
                  className="text-base [&>svg]:size-5"
                >
                  <Link href={account.href}>
                    <account.icon />
                    <span>{account.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={name} email={email} allSymbols={allSymbols} />
      </SidebarFooter>
    </Sidebar>
  );
}
