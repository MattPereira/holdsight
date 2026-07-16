import { RiRefreshLine } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The title row shared by the Portfolio and Trades pages: a heading on the
 * left and a single refresh/sync button on the right. The action verb differs
 * per page ("Refresh" vs "Sync"), so callers pass both the idle and busy
 * labels.
 */
export function PageHeader({
  title,
  onRefresh,
  refreshBusy,
  refreshLabel,
  refreshBusyLabel,
  actionPosition = "end",
}: {
  title: string;
  onRefresh?: () => void;
  refreshBusy: boolean;
  refreshLabel: string;
  refreshBusyLabel: string;
  actionPosition?: "adjacent" | "end";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        actionPosition === "end" && "justify-between",
      )}
    >
      <h1 className="text-xl font-semibold">{title}</h1>

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onRefresh}
        disabled={refreshBusy}
        aria-label={refreshBusy ? refreshBusyLabel : refreshLabel}
      >
        <RiRefreshLine className={cn(refreshBusy && "animate-spin")} />
      </Button>
    </div>
  );
}
