import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FUNDAMENTAL_TRUTHS,
  PRINCIPLES_OF_CONSISTENCY,
} from "@/lib/trading-principles";

/**
 * The reading half of the portfolio's Mindset/Strategy pair: the truths and
 * principles a Plan is supposed to embody, shown before the form so they are
 * read on the way in.
 */
export function TradingPrinciplesPanel() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <PrincipleList
        title="Five Fundamental Truths"
        items={FUNDAMENTAL_TRUTHS}
      />
      <PrincipleList
        title="Seven Principles of Consistency"
        items={PRINCIPLES_OF_CONSISTENCY}
      />
    </div>
  );
}

function PrincipleList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    // The rows carry their own spacing, so the Card's gap and bottom padding
    // would only pad the first and last of them twice.
    <Card className="h-full gap-0 pb-0">
      {/* Negative top margin cancels the Card's own top padding so the band
          runs flush to the rounded edge. */}
      <CardHeader className="-mt-(--card-spacing) border-b border-foreground/5 bg-muted/40 py-(--card-spacing)">
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-0">
        {/* The two lists differ in length, so rows share the card's height
            rather than leaving the shorter card with an empty tail. */}
        <ol className="flex h-full flex-col divide-y divide-foreground/5">
          {items.map((item, index) => (
            <li
              key={item}
              className="flex flex-1 items-center gap-4 px-(--card-spacing) py-3 transition-colors hover:bg-accent/50"
            >
              <span className="shrink-0 text-sm text-muted-foreground/60 tabular-nums">
                {index + 1}
              </span>
              <span className="text-base leading-relaxed text-balance">
                {item}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
