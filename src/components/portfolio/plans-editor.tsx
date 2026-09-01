"use client";

import {
  RiAddLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
} from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePlan, savePlan } from "@/app/(app)/plans/actions";
import { SaveIndicator } from "@/components/forms/save-indicator";
import { usePlans } from "@/components/portfolio/plans-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAutosaveEntry } from "@/lib/forms/use-autosave-entry";
import { useUnsavedChangesGuard } from "@/lib/forms/use-unsaved-changes-guard";
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

const SELECTED_PLAN_PARAM = "plan";
const UNSAVED_CHANGES_MESSAGE =
  "This Plan has unsaved changes. Leave the page anyway?";
const allocationPercentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

/**
 * The editor's working copy of a Plan. `targetAllocation` stays a string so
 * the number input can hold in-progress values ("", "1.") that don't parse.
 */
type PlanDraft = {
  name: string;
  color: string | null;
  details: PlanDetails;
  targetAllocation: string;
  symbols: string[];
};

/**
 * Identifies which Plan the always-open form is editing. `key` drives the
 * autosave engine's reset, so it changes only on an explicit switch — never
 * when a brand-new Plan gains its server id mid-edit, which would otherwise
 * discard whatever was typed while the create was in flight.
 */
type EditorSession = {
  key: string;
  plan: Plan | null;
};

const EMPTY_DRAFT: PlanDraft = {
  name: "",
  color: null,
  details: {
    thesis: null,
    invalidation: null,
    entry: null,
    exit: null,
    timeframe: null,
  },
  targetAllocation: "",
  symbols: [],
};

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function newSessionKey(): string {
  return `new:${Date.now()}`;
}

function newSession(): EditorSession {
  return { key: newSessionKey(), plan: null };
}

function draftFromPlan(plan: Plan | null): PlanDraft {
  if (!plan) return EMPTY_DRAFT;
  return {
    name: plan.name,
    color: plan.color,
    details: { ...plan.details },
    targetAllocation: plan.targetAllocationPercent?.toString() ?? "",
    symbols: [...plan.symbols],
  };
}

function sameDraft(a: PlanDraft, b: PlanDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function draftToInput(draft: PlanDraft): PlanInput {
  return {
    name: draft.name,
    color: draft.color,
    details: draft.details,
    targetAllocationPercent:
      draft.targetAllocation === "" ? null : Number(draft.targetAllocation),
    symbols: draft.symbols,
  };
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
  const [isPending, startTransition] = useTransition();

  const [session, setSession] = useState<EditorSession>(() => {
    const initialPlan =
      plans.find(
        (plan) =>
          plan.id ===
          new URLSearchParams(searchParams).get(SELECTED_PLAN_PARAM),
      ) ??
      plans[0] ??
      null;
    return initialPlan
      ? { key: initialPlan.id, plan: initialPlan }
      : newSession();
  });
  // Autosave stays parked until the Plan has a name, since the server rejects
  // a nameless Plan. Mirrored as state rather than read off the draft because
  // it is an input to the very hook that owns the draft.
  const [nameFilled, setNameFilled] = useState(
    () => (session.plan?.name.trim().length ?? 0) > 0,
  );
  function selectPlan(planId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (planId) params.set(SELECTED_PLAN_PARAM, planId);
    else params.delete(SELECTED_PLAN_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const autosave = useAutosaveEntry<PlanDraft, Plan>({
    key: session.key,
    initialEntry: session.plan,
    enabled: nameFilled,
    draftFromEntry: draftFromPlan,
    sameDraft,
    save: async (snapshot, currentEntry) => {
      const result = await savePlan(
        currentEntry?.id ?? null,
        draftToInput(snapshot),
      );
      setPlans(result.plans);
      if (result.error || !result.plan) {
        return {
          status: "error",
          message: result.error ?? "The Plan could not be saved.",
        };
      }
      return { status: "saved", entry: result.plan };
    },
    // The first successful save turns a new draft into a real Plan; point the
    // URL at it so a refresh reopens what's being edited.
    onEntryChange: (nextEntry, previousEntry) => {
      if (!previousEntry && nextEntry) selectPlan(nextEntry.id);
    },
  });

  const { draft, status, saveError } = autosave;
  const activePlan = autosave.entry;
  useUnsavedChangesGuard(
    autosave.dirty || status === "saving" || status === "error",
    UNSAVED_CHANGES_MESSAGE,
  );

  const claimedByOthers = new Set(
    plans
      .filter((plan) => plan.id !== activePlan?.id)
      .flatMap((plan) => plan.symbols.map(symbolKey)),
  );
  const seen = new Set<string>();
  const selectableSymbols = [...draft.symbols, ...allSymbols].filter(
    (symbol) => {
      const key = symbolKey(symbol);
      if (claimedByOthers.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );

  /** Persists any pending edit before the form switches to another Plan. */
  async function leaveCurrentPlan(): Promise<boolean> {
    const flushed = await autosave.flushBeforeMutation();
    if (!flushed) {
      toast.error("Couldn't save the current Plan — try again in a moment.");
    }
    return flushed;
  }

  function openSession(next: EditorSession) {
    setSession(next);
    setNameFilled((next.plan?.name.trim().length ?? 0) > 0);
    selectPlan(next.plan?.id ?? null);
  }

  async function handleSelectPlan(plan: Plan) {
    if (plan.id === activePlan?.id) return;
    if (!(await leaveCurrentPlan())) return;
    openSession({ key: plan.id, plan });
  }

  async function handleNewPlan() {
    if (!(await leaveCurrentPlan())) return;
    openSession(newSession());
  }

  function handleDelete() {
    const planId = activePlan?.id;
    if (!planId) return;
    startTransition(async () => {
      // Settle the save queue first so an in-flight create can't outlive the
      // delete and leave an orphaned Plan behind.
      await autosave.flushBeforeMutation();
      const result = await deletePlan(planId);
      setPlans(result.plans);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const nextPlan = result.plans[0] ?? null;
      openSession(
        nextPlan ? { key: nextPlan.id, plan: nextPlan } : newSession(),
      );
    });
  }

  function updateDraft(update: (current: PlanDraft) => PlanDraft) {
    autosave.setDraft(update);
  }

  function updateName(value: string) {
    setNameFilled(value.trim().length > 0);
    updateDraft((current) => ({ ...current, name: value }));
  }

  function toggleSymbol(symbol: string) {
    const key = symbolKey(symbol);
    updateDraft((current) => ({
      ...current,
      symbols: current.symbols.some((value) => symbolKey(value) === key)
        ? current.symbols.filter((value) => symbolKey(value) !== key)
        : [...current.symbols, symbol],
    }));
  }

  function updateDetail(field: keyof PlanDetails, value: string) {
    updateDraft((current) => ({
      ...current,
      details: { ...current.details, [field]: value || null },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Plans</h2>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="ml-auto size-10"
          aria-label="New Plan"
          onClick={handleNewPlan}
          disabled={isPending}
        >
          <RiAddLine />
        </Button>
        <Select
          value={activePlan?.id ?? ""}
          onValueChange={(planId) => {
            const plan = plans.find((candidate) => candidate.id === planId);
            if (plan) void handleSelectPlan(plan);
          }}
          disabled={isPending || plans.length === 0}
        >
          <SelectTrigger
            size="lg"
            className="w-full max-w-xs"
            aria-label="Current plan"
          >
            <SelectValue placeholder="No plans yet" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              <SelectLabel>Plans</SelectLabel>
              {[...plans]
                .sort(
                  (a, b) =>
                    (b.targetAllocationPercent ?? -1) -
                    (a.targetAllocationPercent ?? -1),
                )
                .map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-sm border"
                      style={{
                        backgroundColor: plan.color ?? "var(--muted)",
                      }}
                    />
                    <span>{plan.name}</span>
                    <span className="text-muted-foreground">
                      {plan.targetAllocationPercent === null
                        ? "No target"
                        : `${allocationPercentFormat.format(plan.targetAllocationPercent)}%`}
                    </span>
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border p-4 sm:p-6">
        <PlanForm
          draft={draft}
          selectableSymbols={selectableSymbols}
          currentAllocationPercent={
            activePlan ? (currentAllocationByPlanId.get(activePlan.id) ?? 0) : 0
          }
          saveError={saveError}
          saveStatus={status}
          disabled={isPending}
          canDelete={Boolean(activePlan)}
          onNameChange={updateName}
          onColorChange={(color) =>
            updateDraft((current) => ({ ...current, color }))
          }
          onTargetAllocationChange={(targetAllocation) =>
            updateDraft((current) => ({ ...current, targetAllocation }))
          }
          onToggleSymbol={toggleSymbol}
          onDetailChange={updateDetail}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function AllocationProgress({
  color,
  currentAllocationPercent,
  targetAllocationPercent,
  targetAllocationValue,
  disabled,
  onTargetAllocationChange,
}: {
  color: string | null;
  currentAllocationPercent: number;
  targetAllocationPercent: number | null;
  targetAllocationValue: string;
  disabled: boolean;
  onTargetAllocationChange: (value: string) => void;
}) {
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const hasTarget = targetAllocationPercent !== null;
  const isOverTarget =
    hasTarget && currentAllocationPercent > targetAllocationPercent;
  const fillPercent =
    hasTarget && targetAllocationPercent > 0
      ? Math.min(
          (currentAllocationPercent / targetAllocationPercent) * 100,
          100,
        )
      : 0;

  function finishEditingTarget() {
    setIsEditingTarget(false);
    if (targetAllocationValue === "") return;
    const parsed = Number(targetAllocationValue);
    const normalized = Number.isNaN(parsed)
      ? ""
      : Math.min(50, Math.max(5, Math.round(parsed / 5) * 5)).toString();
    if (normalized !== targetAllocationValue) {
      onTargetAllocationChange(normalized);
    }
  }

  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor="plan-target-allocation" className="sr-only">
        Target allocation
      </FieldLabel>
      <div className="flex items-end justify-between gap-2">
        <span
          className={cn(
            "text-xl font-semibold tabular-nums tracking-tight",
            isOverTarget && "text-amber-600 dark:text-amber-500",
          )}
        >
          {allocationPercentFormat.format(currentAllocationPercent)}%
        </span>
        {isEditingTarget ? (
          <Input
            id="plan-target-allocation"
            type="number"
            min="5"
            max="50"
            step="5"
            inputMode="numeric"
            value={targetAllocationValue}
            onChange={(event) => onTargetAllocationChange(event.target.value)}
            onBlur={finishEditingTarget}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="ml-auto w-20 text-right"
            autoFocus
            disabled={disabled}
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label="Edit target allocation"
            onClick={() => setIsEditingTarget(true)}
            disabled={disabled}
          >
            <span className="text-xl font-semibold tabular-nums tracking-tight">
              {hasTarget ? `${targetAllocationPercent}%` : "Set target"}
            </span>
          </Button>
        )}
      </div>
      {hasTarget ? (
        <div className="h-5 w-full overflow-hidden rounded-md bg-muted">
          <div
            className={cn(
              "h-full rounded-md transition-all",
              !color && (isOverTarget ? "bg-amber-500" : "bg-primary"),
            )}
            style={{
              width: `${fillPercent}%`,
              backgroundColor: color ?? undefined,
            }}
          />
        </div>
      ) : null}
    </Field>
  );
}

function PlanForm({
  draft,
  selectableSymbols,
  currentAllocationPercent,
  saveError,
  saveStatus,
  disabled,
  canDelete,
  onNameChange,
  onColorChange,
  onTargetAllocationChange,
  onToggleSymbol,
  onDetailChange,
  onDelete,
}: {
  draft: PlanDraft;
  selectableSymbols: string[];
  currentAllocationPercent: number;
  saveError: string | null;
  saveStatus: Parameters<typeof SaveIndicator>[0]["status"];
  disabled: boolean;
  canDelete: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string | null) => void;
  onTargetAllocationChange: (value: string) => void;
  onToggleSymbol: (symbol: string) => void;
  onDetailChange: (field: keyof PlanDetails, value: string) => void;
  onDelete: () => void;
}) {
  const selected = new Set(draft.symbols.map(symbolKey));
  const selectedSymbols = selectableSymbols.filter((symbol) =>
    selected.has(symbolKey(symbol)),
  );
  const targetAllocationPercent =
    draft.targetAllocation === "" ||
    Number.isNaN(Number(draft.targetAllocation))
      ? null
      : Number(draft.targetAllocation);

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-4">
            <Field
              data-disabled={disabled}
              data-invalid={Boolean(saveError)}
              className="min-w-0 flex-1"
            >
              <FieldLabel htmlFor="plan-name">Name</FieldLabel>
              <Input
                id="plan-name"
                value={draft.name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="AI infrastructure"
                maxLength={MAX_PLAN_NAME_LENGTH}
                required
                autoComplete="off"
                disabled={disabled}
              />
              <FieldError>{saveError}</FieldError>
            </Field>
            <Field data-disabled={disabled} className="w-auto shrink-0">
              <FieldLabel aria-hidden="true" className="invisible">
                Color
              </FieldLabel>
              <ColorPicker
                value={draft.color}
                onChange={onColorChange}
                disabled={disabled}
              />
            </Field>
          </div>
          <Field data-disabled={disabled} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel>Assets</FieldLabel>
              <SelectedAssetBadges
                selectedSymbols={selectedSymbols}
                onToggle={onToggleSymbol}
                disabled={disabled}
              />
            </div>
            <AssetMultiSelect
              selectableSymbols={selectableSymbols}
              selected={selected}
              onToggle={onToggleSymbol}
              disabled={disabled}
            />
          </Field>
        </div>

        <AllocationProgress
          color={draft.color}
          currentAllocationPercent={currentAllocationPercent}
          targetAllocationPercent={targetAllocationPercent}
          targetAllocationValue={draft.targetAllocation}
          disabled={disabled}
          onTargetAllocationChange={onTargetAllocationChange}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <PlanTextField
            id="plan-thesis"
            label="Thesis"
            placeholder="Why you intend to own these assets."
            value={draft.details.thesis}
            onChange={(value) => onDetailChange("thesis", value)}
            disabled={disabled}
          />
          <PlanTextField
            id="plan-invalidation"
            label="Invalidation"
            placeholder="What would prove the Thesis wrong."
            value={draft.details.invalidation}
            onChange={(value) => onDetailChange("invalidation", value)}
            disabled={disabled}
          />
          <PlanTextField
            id="plan-entry"
            label="Entry"
            placeholder="Conditions for starting or increasing exposure."
            value={draft.details.entry}
            onChange={(value) => onDetailChange("entry", value)}
            disabled={disabled}
          />
          <PlanTextField
            id="plan-exit"
            label="Exit"
            placeholder="Conditions for reducing or closing exposure."
            value={draft.details.exit}
            onChange={(value) => onDetailChange("exit", value)}
            disabled={disabled}
          />
        </div>
        <PlanTextField
          id="plan-timeframe"
          label="Timeframe"
          placeholder="Expected holding or review horizon."
          value={draft.details.timeframe}
          onChange={(value) => onDetailChange("timeframe", value)}
          disabled={disabled}
        />
      </FieldGroup>

      <div className="flex items-center gap-3">
        {canDelete ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={disabled}>
                <RiDeleteBinLine data-icon="inline-start" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this Plan?</AlertDialogTitle>
                <AlertDialogDescription>
                  {draft.name || "This Plan"} and its details will be removed.
                  Assets assigned to it return to being unassigned.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <div className="ml-auto">
          <SaveIndicator status={saveStatus} />
        </div>
      </div>
    </div>
  );
}

function PlanTextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
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

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Plan color"
          disabled={disabled}
        >
          <span
            aria-hidden="true"
            className="size-4 rounded-sm border"
            style={{ backgroundColor: value ?? "var(--muted)" }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-2">
          {ASSET_CHART_COLORS.map((option, index) => (
            <button
              key={option}
              type="button"
              className={cn(
                "size-7 rounded-md border",
                value === option && "border-foreground ring-2 ring-ring",
              )}
              style={{ backgroundColor: option }}
              aria-label={`Use color ${index + 1}`}
              aria-pressed={value === option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AssetMultiSelect({
  selectableSymbols,
  selected,
  onToggle,
  disabled,
}: {
  selectableSymbols: string[];
  selected: Set<string>;
  onToggle: (symbol: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
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
  );
}

function SelectedAssetBadges({
  selectedSymbols,
  onToggle,
  disabled,
}: {
  selectedSymbols: string[];
  onToggle: (symbol: string) => void;
  disabled: boolean;
}) {
  if (selectedSymbols.length === 0) return null;
  return (
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
  );
}
