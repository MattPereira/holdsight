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
    <div className="grid items-start gap-4 lg:grid-cols-2">
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
    <Card className="gap-0 pb-0">
      {/* Negative top margin cancels the Card's own top padding so the band
          runs flush to the rounded edge. */}
      <CardHeader className="-mt-(--card-spacing) border-b border-foreground/5 bg-muted/40 py-(--card-spacing)">
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ol className="divide-y divide-foreground/5">
          {items.map((item, index) => (
            <li
              key={item}
              className="flex items-center gap-4 px-(--card-spacing) py-3 transition-colors hover:bg-accent/50"
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
