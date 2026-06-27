"use client";

import {
  RiCheckLine,
  RiCloseLine,
  RiExpandUpDownLine,
} from "@remixicon/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function TransactionsSymbolFilter({
  symbols,
  value,
  onChange,
}: {
  symbols: string[];
  value: string | null;
  onChange: (symbol: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Filter transactions by symbol"
            className="w-[180px] justify-between font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value ?? "Filter by symbol…"}
            </span>
            {!value ? <RiExpandUpDownLine className="size-4 opacity-50" /> : null}
          </Button>
        </PopoverTrigger>

        {value ? (
          <button
            type="button"
            aria-label="Clear symbol filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange(null)}
          >
            <RiCloseLine className="size-4" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search symbol…" />
          <CommandList>
            <CommandEmpty>No matching symbols.</CommandEmpty>
            <CommandGroup>
              {symbols.map((symbol) => (
                <CommandItem
                  key={symbol}
                  value={symbol}
                  onSelect={(selected) => {
                    onChange(selected === value ? null : selected);
                    setOpen(false);
                  }}
                >
                  <RiCheckLine
                    className={cn(
                      "mr-2 size-4",
                      value === symbol ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {symbol}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
