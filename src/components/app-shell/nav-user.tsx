"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RiExpandUpDownLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLogoutBoxRLine,
  RiMoonLine,
  RiSunLine,
} from "@remixicon/react";
import { useTheme } from "next-themes";

import { switchViewAs } from "@/components/app-shell/actions";
import { useHiddenAmounts } from "@/hooks/use-hidden-amounts";
import { authClient } from "@/lib/auth/client";
import type { UserSummary } from "@/lib/auth/user-summary";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function NavUser({
  name,
  email,
  hiddenAmounts,
  users,
  activeUserId,
}: {
  name: string;
  email: string;
  hiddenAmounts: boolean;
  users: UserSummary[];
  activeUserId: string;
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { hidden, toggle: toggleHiddenAmounts } =
    useHiddenAmounts(hiddenAmounts);
  const [isPending, setIsPending] = useState(false);
  const [isSwitching, startSwitching] = useTransition();

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
              {/* The email is deliberately absent here: this row is on screen
                  in every screenshot, and it identifies the user. It stays in
                  the dropdown below, which is only open on purpose. */}
              <span className="flex-1 truncate text-left text-sm font-medium">
                {name}
              </span>
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
            {users.length > 1 ? (
              <>
                <DropdownMenuRadioGroup
                  value={activeUserId}
                  onValueChange={(userId) => {
                    if (userId === activeUserId) return;
                    startSwitching(() => switchViewAs(userId));
                  }}
                >
                  {users.map((user) => (
                    <DropdownMenuRadioItem
                      key={user.id}
                      value={user.id}
                      disabled={isSwitching}
                      className="pl-2"
                    >
                      <span className="truncate">{user.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              onSelect={(event) => {
                // Keep the menu open so toggling theme feels immediate.
                event.preventDefault();
                setTheme(isDark ? "light" : "dark");
              }}
            >
              {isDark ? <RiSunLine /> : <RiMoonLine />}
              {isDark ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                toggleHiddenAmounts();
              }}
            >
              {hidden ? <RiEyeLine /> : <RiEyeOffLine />}
              {hidden ? "Show amounts" : "Hide amounts"}
              <DropdownMenuShortcut>⇧⌘H</DropdownMenuShortcut>
            </DropdownMenuItem>
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
