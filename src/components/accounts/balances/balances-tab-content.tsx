import { BalancesTable } from "@/components/accounts/balances/balances-table";
import type { BalanceGroup, SecondaryColumn } from "@/components/accounts/types";
import { usePlans } from "@/components/portfolio/plans-context";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";

export function BalancesTabContent({
  groups,
  secondaryColumn,
  summary,
}: {
  groups: BalanceGroup[];
  secondaryColumn: SecondaryColumn;
  summary: PortfolioAssetSummary;
}) {
  const { plans } = usePlans();
  const hasHoldings = groups.some((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-6 md:gap-0">
      {hasHoldings ? (
        <PortfolioAllocations
          grandTotalValue={summary.grandTotalValue}
          totals={summary.totals}
          plans={plans}
          totalLabel="Total Assets"
        />
      ) : null}

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <BalancesTable
            key={group.key}
            group={group}
            secondaryColumn={secondaryColumn}
          />
        ))}
      </div>
    </div>
  );
}
