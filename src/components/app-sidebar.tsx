"use client";

import { useState } from "react";
import { RiArrowRightSLine, RiWalletLine } from "@remixicon/react";

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

const accounts = [
  "Ethereum Virtual Machine",
  "HyperCore",
  "Kraken",
  "Charles Schwab",
];

export function AppSidebar({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [accountsOpen, setAccountsOpen] = useState(true);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="grid flex-1 px-2 py-1.5 text-left leading-tight">
          <span className="truncate text-base font-semibold">Holdsight</span>
          <span className="truncate text-xs text-muted-foreground">
            Universal Portfolio
          </span>
        </div>
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
                aria-expanded={accountsOpen}
                onClick={() => setAccountsOpen((open) => !open)}
              >
                <RiWalletLine />
                <span>Accounts</span>
                <RiArrowRightSLine className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
              {accountsOpen ? (
                <SidebarMenuSub>
                  {accounts.map((account) => (
                    <SidebarMenuSubItem key={account}>
                      <SidebarMenuSubButton asChild>
                        <span>{account}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              ) : null}
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
