import {
  RiErrorWarningLine,
  RiLoader4Line,
  RiSaveLine,
  RiTimeLine,
} from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import type { SaveStatus } from "@/lib/forms/use-autosave-entry";

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <RiLoader4Line className="size-4 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <RiSaveLine className="size-4" />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <RiErrorWarningLine data-icon="inline-start" />
        Save failed
      </Badge>
    );
  }
  if (status === "conflict") {
    return <Badge variant="destructive">Edit conflict</Badge>;
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <RiTimeLine className="size-4" />
      Not saved yet
    </span>
  );
}
