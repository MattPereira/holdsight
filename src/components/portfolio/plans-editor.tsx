"use client";

import {
  RiAddLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiSettings3Line,
} from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePlan, savePlan } from "@/app/(app)/plans/actions";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useAutosaveEntry } from "@/lib/forms/use-autosave-entry";
import { useUnsavedChangesGuard } from "@/lib/forms/use-unsaved-changes-guard";
import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import {
  ASSET_CHART_COLORS,
  type PortfolioAssetSummary,
} from "@/lib/portfolio/asset-totals";
import {
  emptyPlanDetails,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_SYMBOL_LENGTH,
  PLAN_FIELDS,
  type Plan,
  type PlanDetails,
  type PlanInput,
} from "@/lib/portfolio/plan";
import { cn } from "@/lib/utils";

const SELECTED_PLAN_PARAM = "plan";
const PLAN_NAME_PLACEHOLDER = "AI infrastructure";
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
  details: emptyPlanDetails(),
  targetAllocation: "",
  symbols: [],
};

/** Targets are held to the 5-50% range in 5% steps, wherever they're typed. */
function normalizeTargetAllocation(value: string): string {
  if (value === "") return "";
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return "";
  return Math.min(50, Math.max(5, Math.round(parsed / 5) * 5)).toString();
}

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
  // Plans you hold nothing of have no slice in the donut and no row in the
  // allocations list above, so they sort below the ones that do.
  const sortedPlans = useMemo(() => {
    const held = (plan: Plan) =>
      (currentAllocationByPlanId.get(plan.id) ?? 0) > 0;
    return [...plans].sort((a, b) => {
      const heldDiff = Number(held(b)) - Number(held(a));
      if (heldDiff !== 0) return heldDiff;
      return (
        (b.targetAllocationPercent ?? -1) - (a.targetAllocationPercent ?? -1)
      );
    });
  }, [plans, currentAllocationByPlanId]);
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
  // A fresh Plan has nothing to show in the switcher, so the settings popover
  // opens with it: naming it is the one thing that has to happen next.
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    setSettingsOpen(true);
  }

  function handleDelete() {
    const planId = activePlan?.id;
    if (!planId) return;
    setSettingsOpen(false);
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

  /**
   * Adds a ticker the portfolio doesn't hold yet. Symbols are free text — the
   * server only trims and dedupes them — so the checks the picker gets for
   * free (already chosen, spoken for by another Plan) have to be made here.
   */
  function addSymbol(symbol: string): string | null {
    const key = symbolKey(symbol);
    if (!key) return "Enter a ticker symbol.";
    if (draft.symbols.some((value) => symbolKey(value) === key)) {
      return `${key} is already in this Plan.`;
    }
    if (claimedByOthers.has(key)) {
      return `${key} belongs to another Plan.`;
    }
    updateDraft((current) => ({ ...current, symbols: [...current.symbols, key] }));
    return null;
  }

  function clearSymbols() {
    updateDraft((current) => ({ ...current, symbols: [] }));
  }

  function updateDetail(field: keyof PlanDetails, value: string) {
    updateDraft((current) => ({
      ...current,
      details: { ...current.details, [field]: value || null },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PlanForm
          draft={draft}
          plans={sortedPlans}
          activePlanId={activePlan?.id ?? null}
          selectableSymbols={selectableSymbols}
          currentAllocationPercent={
            activePlan ? (currentAllocationByPlanId.get(activePlan.id) ?? 0) : 0
          }
          saveError={saveError}
          disabled={isPending}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
          onNameChange={updateName}
          onColorChange={(color) =>
            updateDraft((current) => ({ ...current, color }))
          }
          onTargetAllocationChange={(targetAllocation) =>
            updateDraft((current) => ({ ...current, targetAllocation }))
          }
          onToggleSymbol={toggleSymbol}
          onClearSymbols={clearSymbols}
          onAddSymbol={addSymbol}
          onDetailChange={updateDetail}
          onSelectPlan={handleSelectPlan}
          onNewPlan={handleNewPlan}
          onDelete={handleDelete}
          canDelete={Boolean(activePlan)}
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
    const normalized = normalizeTargetAllocation(targetAllocationValue);
    if (normalized !== targetAllocationValue) {
      onTargetAllocationChange(normalized);
    }
  }

  const currentLabel = `${allocationPercentFormat.format(
    currentAllocationPercent,
  )}${hasTarget ? "" : "%"}`;

  return (
    <Field data-disabled={disabled}>
      {/* Current and target sit side by side rather than at opposite ends of
          the row, where they read as the two endpoints of a range instead of
          an amount and the goal it is measured against. */}
      <div className="flex items-center justify-between gap-2">
        <FieldLabel className="text-base">Allocation</FieldLabel>
        <div className="flex items-center gap-1">
          <span className="text-base font-semibold tabular-nums tracking-tight">
            {currentLabel}
          </span>
          {hasTarget ? (
            <span className="text-base font-semibold text-muted-foreground">
              /
            </span>
          ) : null}
          {isEditingTarget ? (
            <Input
              id="plan-target-allocation"
              aria-label="Target allocation"
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
              className="h-7 w-20 text-right"
              autoFocus
              disabled={disabled}
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mx-1 h-8 px-1"
              aria-label="Edit target allocation"
              onClick={() => setIsEditingTarget(true)}
              disabled={disabled}
            >
              <span className="text-base font-semibold tabular-nums tracking-tight">
                {hasTarget ? `${targetAllocationPercent}%` : "Set target"}
              </span>
            </Button>
          )}
        </div>
      </div>
      <div className="h-8 w-full overflow-hidden rounded-lg bg-muted">
        <div
          className={cn(
            "h-full rounded-lg transition-all",
            !color && (isOverTarget ? "bg-amber-500" : "bg-primary"),
          )}
          style={{
            width: `${fillPercent}%`,
            backgroundColor: color ?? undefined,
          }}
        />
      </div>
    </Field>
  );
}

function PlanForm({
  draft,
  plans,
  activePlanId,
  selectableSymbols,
  currentAllocationPercent,
  saveError,
  disabled,
  settingsOpen,
  onSettingsOpenChange,
  onNameChange,
  onColorChange,
  onTargetAllocationChange,
  onToggleSymbol,
  onClearSymbols,
  onAddSymbol,
  onDetailChange,
  onSelectPlan,
  onNewPlan,
  onDelete,
  canDelete,
}: {
  draft: PlanDraft;
  plans: Plan[];
  activePlanId: string | null;
  selectableSymbols: string[];
  currentAllocationPercent: number;
  saveError: string | null;
  disabled: boolean;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onColorChange: (value: string | null) => void;
  onTargetAllocationChange: (value: string) => void;
  onToggleSymbol: (symbol: string) => void;
  onClearSymbols: () => void;
  onAddSymbol: (symbol: string) => string | null;
  onDetailChange: (field: keyof PlanDetails, value: string) => void;
  onSelectPlan: (plan: Plan) => void;
  onNewPlan: () => void;
  onDelete: () => void;
  canDelete: boolean;
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
          <Field
            data-disabled={disabled}
            data-invalid={Boolean(saveError)}
            className="min-w-0"
          >
            <FieldLabel htmlFor="plan-select" className="text-base">
              Plan
            </FieldLabel>
            {/* The control does one thing — choose which Plan you're looking
                at — so the whole of it opens the list. Everything that acts on
                the Plan itself (its name, its colour, starting another one,
                deleting it) lives behind the settings button beside it. */}
            <div className="flex items-center gap-2">
              <PlanSwitcher
                name={draft.name}
                color={draft.color}
                plans={plans}
                activePlanId={activePlanId}
                onSelect={onSelectPlan}
                disabled={disabled}
                invalid={Boolean(saveError)}
              />
              <PlanSettings
                open={settingsOpen}
                onOpenChange={onSettingsOpenChange}
                name={draft.name}
                color={draft.color}
                targetAllocation={draft.targetAllocation}
                disabled={disabled}
                canDelete={canDelete}
                onNameChange={onNameChange}
                onColorChange={onColorChange}
                onTargetAllocationChange={onTargetAllocationChange}
                onNewPlan={onNewPlan}
                onDelete={onDelete}
              />
            </div>
            <FieldError>{saveError}</FieldError>
          </Field>
          <AssetsField
            selectableSymbols={selectableSymbols}
            selected={selected}
            selectedSymbols={selectedSymbols}
            onToggle={onToggleSymbol}
            onClear={onClearSymbols}
            onAdd={onAddSymbol}
            disabled={disabled}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PLAN_FIELDS.map((field) => (
            <PlanTextField
              key={field.key}
              id={`plan-${field.key}`}
              label={field.label}
              placeholder={field.prompt}
              value={draft.details[field.key]}
              onChange={(value) => onDetailChange(field.key, value)}
              disabled={disabled}
            />
          ))}
        </div>

        <AllocationProgress
          color={draft.color}
          currentAllocationPercent={currentAllocationPercent}
          targetAllocationPercent={targetAllocationPercent}
          targetAllocationValue={draft.targetAllocation}
          disabled={disabled}
          onTargetAllocationChange={onTargetAllocationChange}
        />
      </FieldGroup>
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
      <FieldLabel htmlFor={id} className="text-base">
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        className="md:text-base"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={MAX_PLAN_TEXT_LENGTH}
        rows={3}
        disabled={disabled}
      />
    </Field>
  );
}

/**
 * Everything that acts on the Plan rather than selects one: its name, its
 * colour, starting another Plan, and deleting this one. Folding them behind a
 * single button keeps the row above unambiguous — that control only switches
 * Plans.
 */
function PlanSettings({
  open,
  onOpenChange,
  name,
  color,
  targetAllocation,
  disabled,
  canDelete,
  onNameChange,
  onColorChange,
  onTargetAllocationChange,
  onNewPlan,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  color: string | null;
  targetAllocation: string;
  disabled: boolean;
  canDelete: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string | null) => void;
  onTargetAllocationChange: (value: string) => void;
  onNewPlan: () => void;
  onDelete: () => void;
}) {
  // The confirmation lives outside the popover: dismissing the popover to
  // show it would otherwise unmount the dialog along with it.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Plan settings"
            disabled={disabled}
            className="text-muted-foreground"
          >
            <RiSettings3Line />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <div className="flex flex-col gap-3">
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor="plan-name">Name</FieldLabel>
              <Input
                id="plan-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={PLAN_NAME_PLACEHOLDER}
                maxLength={MAX_PLAN_NAME_LENGTH}
                required
                autoComplete="off"
                disabled={disabled}
              />
            </Field>

            <Field data-disabled={disabled}>
              <FieldLabel htmlFor="plan-settings-target">
                Target allocation
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="plan-settings-target"
                  type="number"
                  min="5"
                  max="50"
                  step="5"
                  inputMode="numeric"
                  placeholder="No target"
                  value={targetAllocation}
                  onChange={(event) =>
                    onTargetAllocationChange(event.target.value)
                  }
                  onBlur={(event) =>
                    onTargetAllocationChange(
                      normalizeTargetAllocation(event.target.value),
                    )
                  }
                  disabled={disabled}
                />
                <InputGroupAddon align="inline-end">%</InputGroupAddon>
              </InputGroup>
            </Field>

            <Field data-disabled={disabled}>
              <FieldLabel>Color</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {ASSET_CHART_COLORS.map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      "size-7 rounded-md border",
                      color === option && "border-foreground ring-2 ring-ring",
                    )}
                    style={{ backgroundColor: option }}
                    aria-label={`Use color ${index + 1}`}
                    aria-pressed={color === option}
                    disabled={disabled}
                    onClick={() => onColorChange(option)}
                  />
                ))}
              </div>
            </Field>

            {/* The two Plan-level actions share the bottom row, pushed to
                opposite ends: deleting is the one thing here you can't take
                back, so it never sits next to the button beside it. */}
            <div className="-mx-3 -mb-3 flex items-center justify-between gap-2 border-t bg-muted/40 px-2 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                disabled={disabled || !canDelete}
                onClick={() => {
                  onOpenChange(false);
                  setConfirmingDelete(true);
                }}
              >
                <RiDeleteBinLine />
                Delete Plan
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onNewPlan()}
              >
                <RiAddLine />
                New Plan
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {name || "This Plan"} and its details will be removed. Assets
              assigned to it return to being unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The Plan list. The trigger is the whole control, so clicking anywhere in it
 * opens the list — it selects a Plan and does nothing else.
 */
function PlanSwitcher({
  name,
  color,
  plans,
  activePlanId,
  onSelect,
  disabled,
  invalid,
}: {
  name: string;
  color: string | null;
  plans: Plan[];
  activePlanId: string | null;
  onSelect: (plan: Plan) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="plan-select"
          type="button"
          aria-label="Switch Plan"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
            "md:text-base dark:bg-input/30 dark:disabled:bg-input/80",
            invalid &&
              "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
          )}
        >
          {color ? (
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-sm border"
              style={{ backgroundColor: color }}
            />
          ) : null}
          <span className={cn("truncate", !name && "text-muted-foreground")}>
            {name || "Unnamed Plan"}
          </span>
          <RiArrowDownSLine className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
      >
        <Command>
          <CommandInput placeholder="Search Plans..." />
          <CommandList>
            <CommandEmpty>No matching Plans.</CommandEmpty>
            {plans.map((plan) => (
              <CommandItem
                key={plan.id}
                value={plan.name}
                onSelect={() => {
                  setOpen(false);
                  onSelect(plan);
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-sm border"
                  style={{ backgroundColor: plan.color ?? "var(--muted)" }}
                />
                <span className="truncate">{plan.name}</span>
                <RiCheckLine
                  className={cn(
                    "size-4 shrink-0",
                    plan.id === activePlanId ? "opacity-100" : "opacity-0",
                  )}
                />
                {/* A shortcut slot rather than a plain span: it pins the
                    target to the right edge and suppresses the check that
                    CommandItem would otherwise append there, since this list
                    marks the active Plan beside its name instead. */}
                <CommandShortcut className="shrink-0 pl-2 text-sm tracking-normal tabular-nums">
                  {plan.targetAllocationPercent === null
                    ? "No target"
                    : `${allocationPercentFormat.format(plan.targetAllocationPercent)}%`}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Assets field mirrors the Plan field above it: the control holds the whole
 * value and opens the picker, and everything that acts on the set rather than
 * picking from it sits behind the settings button beside it.
 */
function AssetsField({
  selectableSymbols,
  selected,
  selectedSymbols,
  onToggle,
  onClear,
  onAdd,
  disabled,
}: {
  selectableSymbols: string[];
  selected: Set<string>;
  selectedSymbols: string[];
  onToggle: (symbol: string) => void;
  onClear: () => void;
  onAdd: (symbol: string) => string | null;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unavailable = disabled || selectableSymbols.length === 0;
  return (
    <Field data-disabled={disabled} className="min-w-0">
      <FieldLabel htmlFor="plan-assets" className="text-base">
        Assets
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              id="plan-assets"
              type="button"
              disabled={unavailable}
              className={cn(
                "flex h-9 w-full min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
                "md:text-base dark:bg-input/30 dark:disabled:bg-input/80",
              )}
            >
              <span
                className={cn(
                  "truncate",
                  selectedSymbols.length === 0 && "text-muted-foreground",
                )}
              >
                {selectedSymbols.length === 0
                  ? "No assets"
                  : selectedSymbols.join(", ")}
              </span>
              <RiArrowDownSLine className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </button>
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
        <AssetsSettings
          canClear={selectedSymbols.length > 0}
          onClear={onClear}
          onAdd={onAdd}
          disabled={disabled}
        />
      </div>
    </Field>
  );
}

/**
 * The Assets menu, mirroring the Plan one: a ticker the portfolio doesn't hold
 * can be typed in here — symbols are free text, so a Plan can name something
 * before you own any of it — and the whole set can be cleared at once.
 */
function AssetsSettings({
  canClear,
  onClear,
  onAdd,
  disabled,
}: {
  canClear: boolean;
  onClear: () => void;
  onAdd: (symbol: string) => string | null;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submitTicker() {
    const message = onAdd(ticker);
    setError(message);
    if (!message) setTicker("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTicker("");
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Asset settings"
          disabled={disabled}
          className="text-muted-foreground"
        >
          <RiSettings3Line />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <Field data-disabled={disabled} data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="plan-add-ticker">Add ticker</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="plan-add-ticker"
                value={ticker}
                onChange={(event) => {
                  setTicker(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  submitTicker();
                }}
                placeholder="SOL"
                maxLength={MAX_SYMBOL_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                aria-invalid={Boolean(error)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  disabled={disabled || ticker.trim() === ""}
                  onClick={submitTicker}
                >
                  Add
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldError>{error}</FieldError>
          </Field>

          {/* Clearing sits in the same bottom-left slot as deleting a Plan,
              since it undoes the same amount of work. */}
          <div className="-mx-3 -mb-3 flex items-center justify-between gap-2 border-t bg-muted/40 px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={disabled || !canClear}
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              <RiDeleteBinLine />
              Clear assets
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
