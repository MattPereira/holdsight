"use client";

import { useState, useTransition } from "react";
import { loadPositions } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { PositionsResult } from "@/lib/types";

function describe(result: PositionsResult): string {
  switch (result.status) {
    case "ready":
      return `${result.positions.length} positions`;
    case "indexing":
      return "indexing…";
    case "rate_limited":
      return "rate limited — wait a moment before reloading";
    case "error":
      return result.message;
  }
}

export function PositionsPanel() {
  const [results, setResults] = useState<PositionsResult[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLoad() {
    startTransition(async () => {
      const data = await loadPositions(); // the only Zerion trigger
      console.dir(data, { depth: null }); // logged to the browser console
      setResults(data);
    });
  }

  return (
    <div>
      <Button type="button" onClick={handleLoad} disabled={isPending}>
        {isPending
          ? "Loading…"
          : results
            ? "Reload positions"
            : "Load positions"}
      </Button>

      {results && (
        <ul>
          {results.map((result) => (
            <li key={result.address}>
              {result.address}: {describe(result)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
