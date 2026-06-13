"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiArrowRightSLine,
  RiFundsBoxLine,
  RiScales3Line,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

const accounts: { label: string; href?: string }[] = [
  { label: "On Chain", href: "/on-chain" },
  { label: "Exchange", href: "/exchange" },
  { label: "Brokerage", href: "/brokerage" },
];

export function AppSidebar({ name, email }: { name: string; email: string }) {
  const [accountsOpen, setAccountsOpen] = useState(true);

  return (
    <Sidebar collapsible="icon">
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
            <SidebarMenuItem
              className="group/collapsible"
              data-state={accountsOpen ? "open" : "closed"}
            >
              <SidebarMenuButton
                type="button"
                size="lg"
                className="text-base [&>svg]:size-5"
                aria-expanded={accountsOpen}
                onClick={() => setAccountsOpen((open) => !open)}
              >
                <RiFundsBoxLine />
                <span>Investments</span>
                <RiArrowRightSLine className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
              {accountsOpen ? (
                <SidebarMenuSub>
                  {accounts.map((account) => (
                    <SidebarMenuSubItem key={account.label}>
                      <SidebarMenuSubButton asChild className="h-9 text-base">
                        {account.href ? (
                          <Link href={account.href}>{account.label}</Link>
                        ) : (
                          <span>{account.label}</span>
                        )}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="text-base [&>svg]:size-5"
              >
                <Link href="/balance-sheet">
                  <RiScales3Line />
                  <span>Balance Sheet</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={name} email={email} />
      </SidebarFooter>
    </Sidebar>
  );
}
