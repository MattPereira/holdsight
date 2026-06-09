"use client";

import { RiSettings3Line } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function PortfolioOverviewSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Portfolio overview settings"
        >
          <RiSettings3Line />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Portfolio Settings</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
