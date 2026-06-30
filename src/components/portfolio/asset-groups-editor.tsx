"use client";

import {
  RiAddLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiPencilLine,
} from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createGroup,
  deleteGroup,
  updateGroup,
} from "@/app/(app)/theses/actions";
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
import { useAssetGroups } from "@/components/portfolio/asset-groups-context";
import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import {
  ASSET_CHART_COLORS,
  groupLabel,
  type AssetGroup,
  type PortfolioAssetSummary,
} from "@/lib/portfolio/asset-totals";
import {
  MAX_ASSET_GROUP_THESIS_SECTION_LENGTH,
  type AssetGroupThesis,
} from "@/lib/portfolio/asset-group-thesis";
import { cn } from "@/lib/utils";

// The selected group lives in the `?group=<id>` query param so the selection
// survives a refresh. The create/edit form is transient, so it stays local.
type EditorMode = "view" | "create" | "edit";

const SELECTED_GROUP_PARAM = "group";

type GroupFormValues = {
  name: string | null;
  color: string | null;
  thesis: AssetGroupThesis;
  targetAllocationPercent: number | null;
  symbols: string[];
};

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

const allocationPercentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function AssetGroupsEditor({
  portfolioSummary,
}: {
  portfolioSummary: PortfolioAssetSummary;
}) {
  const { groups, setGroups } = useAssetGroups();
  const allSymbols = portfolioSummary.totals.map((total) => total.symbol);
  const nameBySymbol = useMemo(
    () =>
      new Map(
        portfolioSummary.totals.flatMap((total) =>
          total.name ? [[symbolKey(total.symbol), total.name] as const] : [],
        ),
      ),
    [portfolioSummary],
  );
  const currentAllocationByGroupId = useMemo(() => {
    const allocations = buildPortfolioAllocations({
      grandTotalValueUsd: portfolioSummary.grandTotalValue,
      totals: portfolioSummary.totals,
      groups,
      minimumAssetValueUsd: Number.NEGATIVE_INFINITY,
    });

    return new Map(
      allocations.rows.flatMap((row) =>
        row.isGroup && row.groupId
          ? [[row.groupId, row.weight * 100] as const]
          : [],
      ),
    );
  }, [groups, portfolioSummary]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<EditorMode>("view");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Fall back to the first group when the param is missing or points at a group
  // that no longer exists (e.g. a stale bookmark or a deleted group).
  const selectedGroup =
    groups.find((group) => group.id === searchParams.get(SELECTED_GROUP_PARAM)) ??
    groups[0];

  function selectGroup(groupId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (groupId) params.set(SELECTED_GROUP_PARAM, groupId);
    else params.delete(SELECTED_GROUP_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const interactionDisabled = mode === "create" || mode === "edit";

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Theses</h1>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="New group"
        onClick={() => {
          setError(null);
          setMode("create");
        }}
        disabled={interactionDisabled}
      >
        <RiAddLine />
      </Button>
    </div>
  );

  if (allSymbols.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Refresh your portfolio to start grouping assets.
        </p>
      </div>
    );
  }

  function handleDelete(groupId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroup(groupId);
      setGroups(result.groups);
      if (result.error) setError(result.error);
      else {
        selectGroup(null);
        setMode("view");
      }
    });
  }

  const selectedGroupId = selectedGroup?.id;
  const editingGroup = mode === "edit" ? selectedGroup : undefined;

  return (
    <div className="flex flex-col gap-6">
      {header}

      <GroupList
        groups={groups}
        selectedGroupId={selectedGroupId}
        interactionDisabled={interactionDisabled}
        onSelect={(groupId) => {
          setError(null);
          selectGroup(groupId);
          setMode("view");
        }}
      />

      {mode === "view" && selectedGroup ? (
        <GroupDetails
          group={selectedGroup}
          nameBySymbol={nameBySymbol}
          currentAllocationPercent={
            currentAllocationByGroupId.get(selectedGroup.id) ?? 0
          }
          onEdit={() => {
            setError(null);
            setMode("edit");
          }}
        />
      ) : null}

      {mode === "create" || mode === "edit" ? (
        <div className="rounded-lg border p-4 sm:p-6">
          <GroupEditor
            key={editingGroup ? editingGroup.id : "create"}
            groups={groups}
            availableSymbols={allSymbols}
            editingGroup={editingGroup}
            onDelete={
              editingGroup ? () => handleDelete(editingGroup.id) : undefined
            }
            onCancel={() => {
              setError(null);
              setMode("view");
            }}
            onSubmit={(values) =>
              startTransition(async () => {
                const previousIds = new Set(groups.map((group) => group.id));
                const result = editingGroup
                  ? await updateGroup(editingGroup.id, values)
                  : await createGroup(values);
                setGroups(result.groups);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (!editingGroup) {
                  // Select the group that was just created so it opens in view.
                  const created = result.groups.find(
                    (group) => !previousIds.has(group.id),
                  );
                  selectGroup(created?.id ?? null);
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

function GroupList({
  groups,
  selectedGroupId,
  interactionDisabled,
  onSelect,
}: {
  groups: AssetGroup[];
  selectedGroupId: string | undefined;
  interactionDisabled: boolean;
  onSelect: (groupId: string) => void;
}) {
  // Highest target allocation first; groups without a target sort to the end.
  const sortedGroups = [...groups].sort(
    (a, b) =>
      (b.targetAllocationPercent ?? -1) - (a.targetAllocationPercent ?? -1),
  );

  return (
    <section className="flex flex-col gap-3">
      {sortedGroups.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sortedGroups.map((group) => {
            const isSelected = group.id === selectedGroupId;
            return (
              <li key={group.id}>
                <button
                  type="button"
                  aria-label={`View ${groupLabel(group.name, group.symbols)}`}
                  aria-pressed={isSelected}
                  disabled={interactionDisabled}
                  onClick={() => onSelect(group.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                    "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    isSelected &&
                      "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-11 shrink-0 rounded-md border"
                    style={{
                      backgroundColor: group.color ?? "var(--muted)",
                    }}
                  />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {groupLabel(group.name, group.symbols)}
                    </span>
                  </div>
                  <div className="ml-auto flex shrink-0 flex-col items-end pl-1">
                    {group.targetAllocationPercent !== null ? (
                      <span className="text-sm font-semibold tabular-nums">
                        {allocationPercentFormat.format(
                          group.targetAllocationPercent,
                        )}
                        %
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No target
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No groups yet.
        </p>
      )}
    </section>
  );
}

function GroupDetails({
  group,
  nameBySymbol,
  currentAllocationPercent,
  onEdit,
}: {
  group: AssetGroup;
  nameBySymbol: Map<string, string>;
  currentAllocationPercent: number;
  onEdit: () => void;
}) {
  const assetNames = group.symbols.map(
    (symbol) => nameBySymbol.get(symbolKey(symbol)) ?? symbol,
  );
  const thesisSections = [
    { label: "Thesis", value: group.thesis.summary },
    {
      label: "Invalidation Criteria",
      value: group.thesis.invalidationCriteria,
    },
    { label: "Bull Case", value: group.thesis.bullCase },
    { label: "Bear Case", value: group.thesis.bearCase },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-lg border p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-11 shrink-0 rounded-md border"
              style={{ backgroundColor: group.color ?? "var(--muted)" }}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="truncate text-base font-semibold">
                {groupLabel(group.name, group.symbols)}
              </h2>
              <div className="flex flex-wrap gap-1">
                {group.symbols.map((symbol) => (
                  <Badge key={symbol} variant="secondary">
                    {symbol}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {assetNames.join(", ")}
          </p>
        </div>

        <AllocationProgress
          currentAllocationPercent={currentAllocationPercent}
          targetAllocationPercent={group.targetAllocationPercent}
        />
      </div>

      <div className="flex flex-col gap-5">
        {thesisSections
          .filter((section) => section.value)
          .map((section) => (
            <section key={section.label} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium">{section.label}</h3>
              <p className="text-sm whitespace-pre-line">{section.value}</p>
            </section>
          ))}
        {group.thesis.allocationStrategyNotes ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-sm font-medium">Allocation Strategy</h3>
            <p className="text-sm whitespace-pre-line">
              {group.thesis.allocationStrategyNotes}
            </p>
          </section>
        ) : null}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Edit ${groupLabel(group.name, group.symbols)}`}
          onClick={onEdit}
        >
          <RiPencilLine data-icon="inline-start" />
          Edit
        </Button>
      </div>
    </div>
  );
}

function AllocationProgress({
  currentAllocationPercent,
  targetAllocationPercent,
}: {
  currentAllocationPercent: number;
  targetAllocationPercent: number | null;
}) {
  const hasTarget =
    targetAllocationPercent !== null && targetAllocationPercent > 0;
  const isOverTarget =
    hasTarget && currentAllocationPercent > targetAllocationPercent;
  // Progress toward target: a full bar means on-target, amber means over.
  const fillPercent = hasTarget
    ? Math.min((currentAllocationPercent / targetAllocationPercent) * 100, 100)
    : 0;

  return (
    <section className="flex w-full flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Current</span>
          <span
            className={cn(
              "text-xl font-semibold tabular-nums tracking-tight",
              isOverTarget
                ? "text-amber-600 dark:text-amber-500"
                : "text-foreground",
            )}
          >
            {allocationPercentFormat.format(currentAllocationPercent)}%
          </span>
        </div>
        {hasTarget ? (
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Target</span>
            <span className="text-xl font-semibold tabular-nums tracking-tight">
              {targetAllocationPercent}%
            </span>
          </div>
        ) : null}
      </div>
      {hasTarget ? (
        <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isOverTarget ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}

function GroupEditor({
  groups,
  availableSymbols,
  editingGroup,
  onDelete,
  onCancel,
  onSubmit,
  isPending,
  error,
}: {
  groups: AssetGroup[];
  availableSymbols: string[];
  editingGroup: AssetGroup | undefined;
  onDelete?: () => void;
  onCancel: () => void;
  onSubmit: (values: GroupFormValues) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(editingGroup?.name ?? "");
  const [color, setColor] = useState<string | null>(
    editingGroup?.color ?? null,
  );
  const [thesis, setThesis] = useState<AssetGroupThesis>(() => ({
    summary: editingGroup?.thesis.summary ?? null,
    bullCase: editingGroup?.thesis.bullCase ?? null,
    bearCase: editingGroup?.thesis.bearCase ?? null,
    invalidationCriteria: editingGroup?.thesis.invalidationCriteria ?? null,
    allocationStrategyNotes:
      editingGroup?.thesis.allocationStrategyNotes ?? null,
  }));
  const [targetAllocation, setTargetAllocation] = useState(
    editingGroup?.targetAllocationPercent?.toString() ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((editingGroup?.symbols ?? []).map(symbolKey)),
  );

  // Symbols claimed by *other* groups are hidden so a symbol can only ever
  // belong to one group at a time.
  const claimedByOthers = new Set(
    groups
      .filter((group) => group.id !== editingGroup?.id)
      .flatMap((group) => group.symbols.map(symbolKey)),
  );
  // Several holdings can share a symbol (e.g. USD from multiple cash sources),
  // so dedupe by key — one entry represents every holding of that symbol.
  const seenSymbols = new Set<string>();
  const selectableSymbols = availableSymbols.filter((symbol) => {
    const key = symbolKey(symbol);
    if (claimedByOthers.has(key) || seenSymbols.has(key)) return false;
    seenSymbols.add(key);
    return true;
  });

  function toggleSymbol(symbol: string) {
    const key = symbolKey(symbol);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedSymbols = selectableSymbols.filter((symbol) =>
    selected.has(symbolKey(symbol)),
  );
  function updateThesis(field: keyof AssetGroupThesis, value: string): void {
    setThesis((current) => ({ ...current, [field]: value || null }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name: name.trim() || null,
      color,
      thesis,
      targetAllocationPercent:
        targetAllocation === "" ? null : Number(targetAllocation),
      symbols: selectedSymbols,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-disabled={isPending}>
            <FieldLabel htmlFor="group-name">Name</FieldLabel>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Defaults to the joined symbols"
              autoComplete="off"
              disabled={isPending}
            />
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
          <Field data-disabled={isPending} data-invalid={Boolean(error)}>
            <FieldLabel>Assets ({selectedSymbols.length} selected)</FieldLabel>
            <AssetMultiSelect
              selectableSymbols={selectableSymbols}
              selected={selected}
              selectedSymbols={selectedSymbols}
              onToggle={toggleSymbol}
              disabled={isPending}
            />
            <FieldError>{error}</FieldError>
          </Field>

          <Field data-disabled={isPending}>
            <FieldLabel htmlFor="group-target-allocation">
              Target allocation (%)
            </FieldLabel>
            <Input
              id="group-target-allocation"
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

        <h3 className="text-sm font-medium">Thesis sections</h3>

        <Field data-disabled={isPending}>
          <FieldLabel htmlFor="group-thesis-summary">Thesis</FieldLabel>
          <FieldDescription>
            The core reason for owning this asset group.
          </FieldDescription>
          <Textarea
            id="group-thesis-summary"
            value={thesis.summary ?? ""}
            onChange={(event) => updateThesis("summary", event.target.value)}
            placeholder="Why you own it and how it can create value"
            maxLength={MAX_ASSET_GROUP_THESIS_SECTION_LENGTH}
            rows={5}
            disabled={isPending}
          />
        </Field>

        <Field data-disabled={isPending}>
          <FieldLabel htmlFor="group-bull-case">Bull Case</FieldLabel>
          <FieldDescription>
            Developments that would make the investment outperform.
          </FieldDescription>
          <Textarea
            id="group-bull-case"
            value={thesis.bullCase ?? ""}
            onChange={(event) => updateThesis("bullCase", event.target.value)}
            placeholder="Growth drivers, catalysts, and upside scenarios"
            maxLength={MAX_ASSET_GROUP_THESIS_SECTION_LENGTH}
            rows={7}
            disabled={isPending}
          />
        </Field>

        <Field data-disabled={isPending}>
          <FieldLabel htmlFor="group-bear-case">Bear Case</FieldLabel>
          <FieldDescription>
            Risks and scenarios that could impair the investment.
          </FieldDescription>
          <Textarea
            id="group-bear-case"
            value={thesis.bearCase ?? ""}
            onChange={(event) => updateThesis("bearCase", event.target.value)}
            placeholder="Competitive, market, regulatory, and execution risks"
            maxLength={MAX_ASSET_GROUP_THESIS_SECTION_LENGTH}
            rows={7}
            disabled={isPending}
          />
        </Field>

        <Field data-disabled={isPending}>
          <FieldLabel htmlFor="group-invalidation-criteria">
            Invalidation Criteria
          </FieldLabel>
          <FieldDescription>
            Observable conditions that should trigger a reduction or exit.
          </FieldDescription>
          <Textarea
            id="group-invalidation-criteria"
            value={thesis.invalidationCriteria ?? ""}
            onChange={(event) =>
              updateThesis("invalidationCriteria", event.target.value)
            }
            placeholder="Specific evidence that would prove the thesis wrong"
            maxLength={MAX_ASSET_GROUP_THESIS_SECTION_LENGTH}
            rows={7}
            disabled={isPending}
          />
        </Field>

        <Field data-disabled={isPending}>
          <FieldLabel htmlFor="group-allocation-strategy-notes">
            Allocation Strategy Notes
          </FieldLabel>
          <FieldDescription>
            Position sizing, concentration, and rebalancing rules. This section
            is complete when a target allocation is also set.
          </FieldDescription>
          <Textarea
            id="group-allocation-strategy-notes"
            value={thesis.allocationStrategyNotes ?? ""}
            onChange={(event) =>
              updateThesis("allocationStrategyNotes", event.target.value)
            }
            placeholder="Sizing rationale and rules for adding or reducing"
            maxLength={MAX_ASSET_GROUP_THESIS_SECTION_LENGTH}
            rows={5}
            disabled={isPending}
          />
        </Field>
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
          <Button
            type="submit"
            disabled={isPending || selectedSymbols.length < 1}
          >
            {editingGroup ? "Save group" : "Create group"}
          </Button>
        </div>
      </div>
    </form>
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
            disabled={disabled}
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
