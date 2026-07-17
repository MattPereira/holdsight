"use client";

import Link from "next/link";
import {
  RiArrowLeftRightLine,
  RiBankLine,
  RiBookOpenLine,
  RiLightbulbLine,
  RiPieChartLine,
} from "@remixicon/react";

import { NavUser } from "@/components/app-shell/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

const navItems = [
  { label: "Portfolio", href: "/", icon: RiPieChartLine },
  { label: "Theses", href: "/theses", icon: RiLightbulbLine },
  { label: "Journal", href: "/journal", icon: RiBookOpenLine },
  { label: "Trades", href: "/trades", icon: RiArrowLeftRightLine },
];

const accountNavItems = [
  { label: "Wallets", href: "/wallets" },
  { label: "Brokerages", href: "/brokerages" },
  { label: "Exchanges", href: "/exchanges" },
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="lg"
                  tooltip="Accounts"
                  className="text-base [&>svg]:size-5"
                >
                  <Link href="/accounts">
                    <RiBankLine />
                    <span>Accounts</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {accountNavItems.map((item) => (
                    <SidebarMenuSubItem key={item.label}>
                      <SidebarMenuSubButton
                        asChild
                        className="h-9 !text-base"
                      >
                        <Link href={item.href}>{item.label}</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={name} email={email} />
      </SidebarFooter>
    </Sidebar>
  );
}
