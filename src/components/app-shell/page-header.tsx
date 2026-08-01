import { RiRefreshLine } from "@remixicon/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The title row shared by the Portfolio, Trades, Accounts and account details
 * pages: a heading on the left and a labelled refresh/sync button on the right.
 * The action verb differs per page ("Refresh" vs "Sync"), so callers pass both
 * the idle and busy labels; the busy label doubles as the visible text while
 * the action runs.
 *
 * `adjacent` renders next to the heading for page-specific chrome — the tab
 * switcher on account details, the settings link on Accounts.
 */
export function PageHeader({
  title,
  adjacent,
  onRefresh,
  refreshBusy,
  refreshLabel,
  refreshBusyLabel,
}: {
  title: string;
  adjacent?: ReactNode;
  onRefresh?: () => void;
  refreshBusy: boolean;
  refreshLabel: string;
  refreshBusyLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {adjacent}
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRefresh}
        disabled={refreshBusy}
      >
        <RiRefreshLine
          data-icon="inline-start"
          className={cn(refreshBusy && "animate-spin")}
        />
        {refreshBusy ? refreshBusyLabel : refreshLabel}
      </Button>
    </div>
  );
}
