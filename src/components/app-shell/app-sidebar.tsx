"use client";

import Link from "next/link";
import {
  RiArrowLeftRightLine,
  RiArrowRightSLine,
  RiBankLine,
  RiBookOpenLine,
  RiLightbulbLine,
  RiPieChartLine,
  RiSettings3Line,
} from "@remixicon/react";

import { NavUser } from "@/components/app-shell/nav-user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  { label: "Connections", href: "/connections", icon: RiSettings3Line },
];

const accountsGroup = {
  label: "Accounts",
  icon: RiBankLine,
  items: [
    { label: "Wallets", href: "/wallets" },
    { label: "Exchanges", href: "/exchanges" },
    { label: "Brokerages", href: "/brokerages" },
  ],
};

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

              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={accountsGroup.label}
                      className="text-base [&>svg]:size-5"
                    >
                      <accountsGroup.icon />
                      <span>{accountsGroup.label}</span>
                      <RiArrowRightSLine className="ml-auto size-4! transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {accountsGroup.items.map((item) => (
                        <SidebarMenuSubItem key={item.label}>
                          <SidebarMenuSubButton
                            asChild
                            className="h-10 data-[size=md]:text-base"
                          >
                            <Link href={item.href}>
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
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
