"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { loadEvmPositions, loadHyperCorePositions } from "@/app/actions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { walletTotal } from "@/lib/portfolio/asset-totals";
import type { Position, PositionsResult } from "@/lib/portfolio/types";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

function shortenAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function statusMessage(result: PositionsResult): string {
  switch (result.status) {
    case "indexing":
      return "Indexing...";
    case "rate_limited":
      return "Rate limited. Wait a moment before reloading.";
    case "error":
      return result.message;
    case "ready":
      return "No positions.";
  }
}

function positionKey(position: Position, i: number): string {
  return position.sourcePositionId ?? `${position.symbol}-${position.chainId}-${i}`;
}

/* ------------------------------- desktop ------------------------------- */

function DesktopWalletTable({ positions }: { positions: Position[] }) {
  return (
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Symbol</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position, i) => (
            <TableRow key={positionKey(position, i)}>
              <TableCell className="font-medium">{position.symbol}</TableCell>
              <TableCell className="text-muted-foreground">
                {position.chainId}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {usd.format(position.priceUsd)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {amountFormat.format(position.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {usd.format(position.valueUsd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------- mobile ------------------------------- */

function PositionCardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

function MobileWalletList({ positions }: { positions: Position[] }) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
      {positions.map((position, i) => (
        <li key={positionKey(position, i)} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{position.symbol}</span>
            <span className="text-xs text-muted-foreground">
              {position.chainId}
            </span>
          </div>
          <PositionCardRow label="Price" value={usd.format(position.priceUsd)} />
          <PositionCardRow
            label="Amount"
            value={amountFormat.format(position.amount)}
          />
          <PositionCardRow label="Total" value={usd.format(position.valueUsd)} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- accordion ----------------------------- */

function WalletAccordionItem({ result }: { result: PositionsResult }) {
  const hasPositions =
    result.status === "ready" && result.positions.length > 0;

  return (
    <AccordionItem value={result.address} className="rounded-lg border">
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex flex-1 items-center justify-between gap-4 pr-2">
          <span className="font-mono text-sm text-muted-foreground">
            {shortenAddress(result.address)}
          </span>
          <span className="text-sm font-medium tabular-nums">
            {usd.format(walletTotal(result))}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {hasPositions ? (
          <>
            <DesktopWalletTable positions={result.positions} />
            <MobileWalletList positions={result.positions} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {statusMessage(result)}
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/* ------------------------------ container ------------------------------ */

export function PositionsDisplay({
  initialResults,
  source,
  title,
}: {
  initialResults: PositionsResult[];
  source: "evm" | "hypercore";
  title: string;
}) {
  const [results, setResults] = useState<PositionsResult[]>(initialResults);
  const [isPending, startTransition] = useTransition();

  function handleLoad() {
    startTransition(async () => {
      const data =
        source === "evm" ? await loadEvmPositions() : await loadHyperCorePositions();
      setResults(data);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleLoad}
          disabled={isPending}
          aria-label={results.length > 0 ? `Refresh ${title}` : `Load ${title}`}
        >
          <RiRefreshLine />
        </Button>
      </div>

      {results.length > 0 && (
        <div className="flex flex-col gap-4">
          <Accordion
            type="multiple"
            defaultValue={results.map((result) => result.address)}
            className="gap-4"
          >
            {results.map((result) => (
              <WalletAccordionItem key={result.address} result={result} />
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}
