import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Marks a Sensitive Value — a figure that reveals the size of the user's
 * holdings, meaning a USD value or an asset quantity. Asset prices and
 * allocation percentages are not Sensitive Values and should not be wrapped:
 * they reveal nothing absolute, and hiding them makes a shared screenshot
 * useless without making it safer.
 *
 * Wrapping is all this does. The blur lives in one CSS rule keyed off
 * `data-sensitive`, which is why this works unchanged in server components,
 * client components, and around strings that were formatted elsewhere. In SVG,
 * where a <span> is invalid, put `data-sensitive` on the SVG node directly.
 */
export function Sensitive({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span data-sensitive className={cn(className)}>
      {children}
    </span>
  );
}
