"use client";

import {
  RiAddLine,
  RiAlertLine,
  RiArrowDownLine,
  RiArrowUpLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiLightbulbLine,
  RiPencilLine,
  RiScales3Line,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createPlan, deletePlan, updatePlan } from "@/app/(app)/plans/actions";
import { usePlans } from "@/components/portfolio/plans-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import {
  ASSET_CHART_COLORS,
  type PortfolioAssetSummary,
} from "@/lib/portfolio/asset-totals";
import {
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  type Plan,
  type PlanDetails,
  type PlanInput,
} from "@/lib/portfolio/plan";
import { cn } from "@/lib/utils";

type EditorMode = "view" | "create" | "edit";

const SELECTED_PLAN_PARAM = "plan";
const allocationPercentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function PlansEditor({
  portfolioSummary,
}: {
  portfolioSummary: PortfolioAssetSummary;
}) {
  const { plans, setPlans } = usePlans();
  const allSymbols = portfolioSummary.totals.map((total) => total.symbol);
  const currentAllocationByPlanId = useMemo(() => {
    const allocations = buildPortfolioAllocations({
      grandTotalValueUsd: portfolioSummary.grandTotalValue,
      totals: portfolioSummary.totals,
      plans,
      minimumAssetValueUsd: Number.NEGATIVE_INFINITY,
    });
    return new Map(
      allocations.rows.flatMap((row) =>
        row.isPlan && row.planId
          ? [[row.planId, row.weight * 100] as const]
          : [],
      ),
    );
  }, [plans, portfolioSummary]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<EditorMode>("view");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedPlan =
    plans.find((plan) => plan.id === searchParams.get(SELECTED_PLAN_PARAM)) ??
    plans[0];

  function selectPlan(planId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (planId) params.set(SELECTED_PLAN_PARAM, planId);
    else params.delete(SELECTED_PLAN_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const interactionDisabled = mode !== "view";
  const editingPlan = mode === "edit" ? selectedPlan : undefined;

  function handleDelete(planId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePlan(planId);
      setPlans(result.plans);
      if (result.error) setError(result.error);
      else {
        selectPlan(null);
        setMode("view");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">Plans</h1>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="New Plan"
          onClick={() => {
            setError(null);
            setMode("create");
          }}
          disabled={interactionDisabled}
        >
          <RiAddLine />
        </Button>
      </div>

      <PlanList
        plans={plans}
        selectedPlanId={selectedPlan?.id}
        interactionDisabled={interactionDisabled}
        onSelect={(planId) => {
          setError(null);
          selectPlan(planId);
          setMode("view");
        }}
      />

      {mode === "view" && selectedPlan ? (
        <PlanDetailsView
          plan={selectedPlan}
          currentAllocationPercent={
            currentAllocationByPlanId.get(selectedPlan.id) ?? 0
          }
          onEdit={() => {
            setError(null);
            setMode("edit");
          }}
        />
      ) : null}

      {mode !== "view" ? (
        <div className="rounded-lg border p-4 sm:p-6">
          <PlanEditor
            key={editingPlan?.id ?? "create"}
            plans={plans}
            availableSymbols={allSymbols}
            editingPlan={editingPlan}
            onDelete={
              editingPlan ? () => handleDelete(editingPlan.id) : undefined
            }
            onCancel={() => {
              setError(null);
              setMode("view");
            }}
            onSubmit={(values) =>
              startTransition(async () => {
                const previousIds = new Set(plans.map((plan) => plan.id));
                const result = editingPlan
                  ? await updatePlan(editingPlan.id, values)
                  : await createPlan(values);
                setPlans(result.plans);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (!editingPlan) {
                  const created = result.plans.find(
                    (plan) => !previousIds.has(plan.id),
                  );
                  selectPlan(created?.id ?? null);
                }
                setMode("view");
              })
            }
            isPending={isPending}
            error={error}
          />
        </div>
      ) : null}
    </div>
  );
}

function PlanList({
  plans,
  selectedPlanId,
  interactionDisabled,
  onSelect,
}: {
  plans: Plan[];
  selectedPlanId: string | undefined;
  interactionDisabled: boolean;
  onSelect: (planId: string) => void;
}) {
  const sortedPlans = [...plans].sort(
    (a, b) =>
      (b.targetAllocationPercent ?? -1) - (a.targetAllocationPercent ?? -1),
  );
  if (sortedPlans.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        No Plans yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sortedPlans.map((plan) => {
        const isSelected = plan.id === selectedPlanId;
        return (
          <li key={plan.id}>
            <button
              type="button"
              aria-label={`View ${plan.name}`}
              aria-pressed={isSelected}
              disabled={interactionDisabled}
              onClick={() => onSelect(plan.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <span
                aria-hidden="true"
                className="size-12 shrink-0 rounded-md border"
                style={{ backgroundColor: plan.color ?? "var(--muted)" }}
              />
              <span className="min-w-0 truncate text-lg font-medium">
                {plan.name}
              </span>
              <span className="ml-auto shrink-0 text-lg font-semibold tabular-nums">
                {plan.targetAllocationPercent === null
                  ? "—"
                  : `${allocationPercentFormat.format(plan.targetAllocationPercent)}%`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PlanDetailsView({
  plan,
  currentAllocationPercent,
  onEdit,
}: {
  plan: Plan;
  currentAllocationPercent: number;
  onEdit: () => void;
}) {
  const sections: PlanSectionProps[] = [
    {
      label: "Thesis",
      value: plan.details.thesis,
      icon: RiLightbulbLine,
      accent: "text-primary",
    },
    {
      label: "Invalidation",
      value: plan.details.invalidation,
      icon: RiAlertLine,
      accent: "text-amber-600 dark:text-amber-500",
    },
    {
      label: "Entry",
      value: plan.details.entry,
      icon: RiArrowUpLine,
      accent: "text-emerald-600 dark:text-emerald-500",
    },
    {
      label: "Exit",
      value: plan.details.exit,
      icon: RiArrowDownLine,
      accent: "text-red-600 dark:text-red-500",
    },
    {
      label: "Timeframe",
      value: plan.details.timeframe,
      icon: RiScales3Line,
      accent: "text-primary",
    },
  ];
  const visibleSections = sections.filter((section) => section.value);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-center gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-14 shrink-0 rounded-md border"
            style={{ backgroundColor: plan.color ?? "var(--muted)" }}
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-1">
              <h2 className="truncate text-lg font-semibold">{plan.name}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                aria-label={`Edit ${plan.name}`}
                onClick={onEdit}
              >
                <RiPencilLine />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {plan.symbols.length > 0 ? (
                plan.symbols.map((symbol) => (
                  <Badge key={symbol} variant="secondary">
                    {symbol}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No assets assigned
                </span>
              )}
            </div>
          </div>
        </div>
        <AllocationProgress
          currentAllocationPercent={currentAllocationPercent}
          targetAllocationPercent={plan.targetAllocationPercent}
        />
      </div>

      {visibleSections.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleSections.map((section) => (
            <PlanSection key={section.label} {...section} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No Plan details yet.
        </p>
      )}
    </div>
  );
}

type PlanSectionProps = {
  label: string;
  value: string | null;
  icon: RemixiconComponentType;
  accent: string;
};

function PlanSection({ label, value, icon: Icon, accent }: PlanSectionProps) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
      <h3 className="flex items-center gap-1.5 text-base font-medium">
        <Icon aria-hidden="true" className={cn("size-4 shrink-0", accent)} />
        {label}
      </h3>
      <PlanBody value={value ?? ""} />
    </section>
  );
}

function PlanBody({ value }: { value: string }) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul className="flex list-disc flex-col gap-1 pl-5 text-base marker:text-muted-foreground">
        {lines.map((line, index) => (
          <li key={index}>{line.replace(/^[-*]\s+/, "")}</li>
        ))}
      </ul>
    );
  }
  return <p className="text-base whitespace-pre-line">{value}</p>;
}

function AllocationProgress({
  currentAllocationPercent,
  targetAllocationPercent,
}: {
  currentAllocationPercent: number;
  targetAllocationPercent: number | null;
}) {
  const hasTarget = targetAllocationPercent !== null;
  const isOverTarget =
    hasTarget && currentAllocationPercent > targetAllocationPercent;
  const fillPercent =
    hasTarget && targetAllocationPercent > 0
      ? Math.min((currentAllocationPercent / targetAllocationPercent) * 100, 100)
      : 0;
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <span
          className={cn(
            "text-xl font-semibold tabular-nums tracking-tight",
            isOverTarget && "text-amber-600 dark:text-amber-500",
          )}
        >
          {allocationPercentFormat.format(currentAllocationPercent)}%
        </span>
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {hasTarget ? `${targetAllocationPercent}%` : "No target"}
        </span>
      </div>
      {hasTarget ? (
        <div className="h-5 w-full overflow-hidden rounded-md bg-muted">
          <div
            className={cn(
              "h-full rounded-md transition-all",
              isOverTarget ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PlanEditor({
  plans,
  availableSymbols,
  editingPlan,
  onDelete,
  onCancel,
  onSubmit,
  isPending,
  error,
}: {
  plans: Plan[];
  availableSymbols: string[];
  editingPlan: Plan | undefined;
  onDelete?: () => void;
  onCancel: () => void;
  onSubmit: (values: PlanInput) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(editingPlan?.name ?? "");
  const [color, setColor] = useState<string | null>(editingPlan?.color ?? null);
  const [details, setDetails] = useState<PlanDetails>(() => ({
    thesis: editingPlan?.details.thesis ?? null,
    invalidation: editingPlan?.details.invalidation ?? null,
    entry: editingPlan?.details.entry ?? null,
    exit: editingPlan?.details.exit ?? null,
    timeframe: editingPlan?.details.timeframe ?? null,
  }));
  const [targetAllocation, setTargetAllocation] = useState(
    editingPlan?.targetAllocationPercent?.toString() ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((editingPlan?.symbols ?? []).map(symbolKey)),
  );

  const claimedByOthers = new Set(
    plans
      .filter((plan) => plan.id !== editingPlan?.id)
      .flatMap((plan) => plan.symbols.map(symbolKey)),
  );
  const seen = new Set<string>();
  const selectableSymbols = [
    ...(editingPlan?.symbols ?? []),
    ...availableSymbols,
  ].filter((symbol) => {
    const key = symbolKey(symbol);
    if (claimedByOthers.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const selectedSymbols = selectableSymbols.filter((symbol) =>
    selected.has(symbolKey(symbol)),
  );

  function toggleSymbol(symbol: string) {
    const key = symbolKey(symbol);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateDetail(field: keyof PlanDetails, value: string) {
    setDetails((current) => ({ ...current, [field]: value || null }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name,
      color,
      details,
      targetAllocationPercent:
        targetAllocation === "" ? null : Number(targetAllocation),
      symbols: selectedSymbols,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-disabled={isPending} data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="plan-name">Name</FieldLabel>
            <Input
              id="plan-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="AI infrastructure"
              maxLength={MAX_PLAN_NAME_LENGTH}
              required
              autoComplete="off"
              disabled={isPending}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <Field data-disabled={isPending}>
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  "flex h-9 items-center rounded-md border px-3 text-sm",
                  color === null && "border-foreground",
                )}
                onClick={() => setColor(null)}
                disabled={isPending}
              >
                Auto
              </button>
              {ASSET_CHART_COLORS.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "size-9 rounded-md border",
                    color === option && "border-foreground ring-2 ring-ring",
                  )}
                  style={{ backgroundColor: option }}
                  aria-label={`Use color ${index + 1}`}
                  aria-pressed={color === option}
                  onClick={() => setColor(option)}
                  disabled={isPending}
                />
              ))}
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-disabled={isPending}>
            <FieldLabel>Assets ({selectedSymbols.length} selected)</FieldLabel>
            <FieldDescription>Optional; assign owned assets now or later.</FieldDescription>
            <AssetMultiSelect
              selectableSymbols={selectableSymbols}
              selected={selected}
              selectedSymbols={selectedSymbols}
              onToggle={toggleSymbol}
              disabled={isPending}
            />
          </Field>
          <Field data-disabled={isPending}>
            <FieldLabel htmlFor="plan-target-allocation">
              Target allocation (%)
            </FieldLabel>
            <Input
              id="plan-target-allocation"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={targetAllocation}
              onChange={(event) => setTargetAllocation(event.target.value)}
              placeholder="Optional"
              disabled={isPending}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PlanTextField
            id="plan-thesis"
            label="Thesis"
            description="Why you intend to own these assets."
            placeholder="Core reasoning and expected source of value"
            value={details.thesis}
            onChange={(value) => updateDetail("thesis", value)}
            disabled={isPending}
          />
          <PlanTextField
            id="plan-invalidation"
            label="Invalidation"
            description="What would prove the Thesis wrong."
            placeholder="Observable evidence or conditions"
            value={details.invalidation}
            onChange={(value) => updateDetail("invalidation", value)}
            disabled={isPending}
          />
          <PlanTextField
            id="plan-entry"
            label="Entry"
            description="Conditions for starting or increasing exposure."
            placeholder="Prices, signals, or staged-entry rules"
            value={details.entry}
            onChange={(value) => updateDetail("entry", value)}
            disabled={isPending}
          />
          <PlanTextField
            id="plan-exit"
            label="Exit"
            description="Conditions for reducing or closing exposure."
            placeholder="Targets, signals, or staged-exit rules"
            value={details.exit}
            onChange={(value) => updateDetail("exit", value)}
            disabled={isPending}
          />
        </div>
        <PlanTextField
          id="plan-timeframe"
          label="Timeframe"
          description="Expected holding or review horizon."
          placeholder="For example: 3–5 years; review quarterly"
          value={details.timeframe}
          onChange={(value) => updateDetail("timeframe", value)}
          disabled={isPending}
        />
      </FieldGroup>

      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={isPending}
          >
            <RiDeleteBinLine data-icon="inline-start" />
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name.trim()}>
            {editingPlan ? "Save Plan" : "Create Plan"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PlanTextField({
  id,
  label,
  description,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Textarea
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={MAX_PLAN_TEXT_LENGTH}
        rows={6}
        disabled={disabled}
      />
    </Field>
  );
}

function AssetMultiSelect({
  selectableSymbols,
  selected,
  selectedSymbols,
  onToggle,
  disabled,
}: {
  selectableSymbols: string[];
  selected: Set<string>;
  selectedSymbols: string[];
  onToggle: (symbol: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-start font-normal text-muted-foreground"
            disabled={disabled || selectableSymbols.length === 0}
          >
            <RiAddLine data-icon="inline-start" />
            Add assets
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder="Search symbols..." />
            <CommandList>
              <CommandEmpty>No matching assets.</CommandEmpty>
              {selectableSymbols.map((symbol) => {
                const key = symbolKey(symbol);
                const isSelected = selected.has(key);
                return (
                  <CommandItem
                    key={key}
                    value={symbol}
                    onSelect={() => onToggle(symbol)}
                  >
                    <RiCheckLine
                      className={cn(
                        "size-4",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-medium">{symbol}</span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedSymbols.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedSymbols.map((symbol) => (
            <Badge key={symbol} variant="secondary" className="gap-1 pr-1">
              {symbol}
              <button
                type="button"
                className="rounded-sm opacity-70 hover:opacity-100"
                aria-label={`Remove ${symbol}`}
                onClick={() => onToggle(symbol)}
                disabled={disabled}
              >
                <RiCloseLine className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
