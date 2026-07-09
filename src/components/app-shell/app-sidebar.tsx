"use client";

import Link from "next/link";
import {
  RiExchangeFundsLine,
  RiFundsLine,
  RiBookOpenLine,
  RiLightbulbLine,
  RiSettings3Line,
  RiWalletLine,
} from "@remixicon/react";

import { NavUser } from "@/components/app-shell/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navGroups = [
  {
    label: "Portfolio",
    items: [
      { label: "Theses", href: "/theses", icon: RiLightbulbLine },
      { label: "Journal", href: "/journal", icon: RiBookOpenLine },
    ],
  },
  {
    label: "Accounts",
    action: { href: "/connections", srLabel: "Manage connections" },
    items: [
      { label: "Wallets", href: "/wallets", icon: RiWalletLine },
      { label: "Exchanges", href: "/exchanges", icon: RiExchangeFundsLine },
      { label: "Brokerages", href: "/brokerages", icon: RiFundsLine },
    ],
  },
];

export function AppSidebar({ name, email }: { name: string; email: string }) {
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
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <div className="flex items-center justify-between">
              <SidebarGroupLabel className="h-auto text-base font-normal text-muted-foreground">
                {group.label}
              </SidebarGroupLabel>
              {group.action && (
                <SidebarGroupAction
                  asChild
                  title={group.action.srLabel}
                  className="static top-auto right-auto translate-x-0 translate-y-0"
                >
                  <Link href={group.action.href}>
                    <RiSettings3Line />
                    <span className="sr-only">{group.action.srLabel}</span>
                  </Link>
                </SidebarGroupAction>
              )}
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      asChild
                      size="lg"
                      tooltip={item.label}
                      className="text-base [&>svg]:size-5"
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={name} email={email} />
      </SidebarFooter>
    </Sidebar>
  );
}
