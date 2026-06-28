"use client";

import {
  RiAddLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiPencilLine,
} from "@remixicon/react";
import { useState, useTransition } from "react";

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
import {
  ASSET_CHART_COLORS,
  groupLabel,
  type AssetGroup,
} from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

type EditorState =
  | { mode: "idle" }
  | { mode: "view"; groupId: string }
  | { mode: "create" }
  | { mode: "edit"; groupId: string };

type GroupFormValues = {
  name: string | null;
  color: string | null;
  thesis: string | null;
  targetAllocationPercent: number | null;
  symbols: string[];
};

const MAX_THESIS_LENGTH = 10_000;

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function AssetGroupsEditor({ allSymbols }: { allSymbols: string[] }) {
  const { groups, setGroups } = useAssetGroups();
  const [editor, setEditor] = useState<EditorState>(() =>
    groups[0] ? { mode: "view", groupId: groups[0].id } : { mode: "idle" },
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (allSymbols.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Refresh your portfolio to start grouping assets.
      </p>
    );
  }

  function handleDelete(groupId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroup(groupId);
      setGroups(result.groups);
      if (result.error) setError(result.error);
      else setEditor({ mode: "idle" });
    });
  }

  const selectedGroupId =
    editor.mode === "view" || editor.mode === "edit"
      ? editor.groupId
      : undefined;
  const selectedGroup = selectedGroupId
    ? groups.find((group) => group.id === selectedGroupId)
    : undefined;
  const editingGroup = editor.mode === "edit" ? selectedGroup : undefined;

  return (
    <div className="flex flex-col gap-6">
      <GroupList
        groups={groups}
        selectedGroupId={selectedGroupId}
        interactionDisabled={
          editor.mode === "create" || editor.mode === "edit"
        }
        onNew={() => {
          setError(null);
          setEditor({ mode: "create" });
        }}
        onSelect={(groupId) => {
          setError(null);
          setEditor({ mode: "view", groupId });
        }}
      />

      {editor.mode === "view" && selectedGroup ? (
        <GroupDetails
          group={selectedGroup}
          onEdit={() => {
            setError(null);
            setEditor({ mode: "edit", groupId: selectedGroup.id });
          }}
        />
      ) : null}

      {editor.mode === "create" || editor.mode === "edit" ? (
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
              setEditor(
                editingGroup
                  ? { mode: "view", groupId: editingGroup.id }
                  : { mode: "idle" },
              );
            }}
            onSubmit={(values) =>
              startTransition(async () => {
                const result = editingGroup
                  ? await updateGroup(editingGroup.id, values)
                  : await createGroup(values);
                setGroups(result.groups);
                if (result.error) setError(result.error);
                else if (editingGroup)
                  setEditor({ mode: "view", groupId: editingGroup.id });
                else setEditor({ mode: "idle" });
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
  onNew,
  onSelect,
}: {
  groups: AssetGroup[];
  selectedGroupId: string | undefined;
  interactionDisabled: boolean;
  onNew: () => void;
  onSelect: (groupId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNew}
          disabled={interactionDisabled}
        >
          <RiAddLine data-icon="inline-start" />
          New group
        </Button>
      </div>

      {groups.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
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
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    isSelected && "ring-2 ring-ring",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-9 shrink-0 rounded-md border"
                    style={{
                      backgroundColor: group.color ?? "var(--muted)",
                    }}
                  />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {groupLabel(group.name, group.symbols)}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {group.symbols.map((symbol) => (
                        <Badge key={symbol} variant="secondary">
                          {symbol}
                        </Badge>
                      ))}
                    </div>
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
  onEdit,
}: {
  group: AssetGroup;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {group.color ? (
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-[3px]"
                style={{ backgroundColor: group.color }}
              />
            ) : null}
            <span className="truncate">
              {groupLabel(group.name, group.symbols)}
            </span>
          </h2>
          <div className="flex flex-wrap gap-1">
            {group.symbols.map((symbol) => (
              <Badge key={symbol} variant="secondary">
                {symbol}
              </Badge>
            ))}
            {group.targetAllocationPercent !== null ? (
              <Badge variant="outline">
                Target {group.targetAllocationPercent}%
              </Badge>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={`Edit ${groupLabel(group.name, group.symbols)}`}
          onClick={onEdit}
        >
          <RiPencilLine />
        </Button>
      </div>

      {group.thesis ? (
        <p className="text-sm whitespace-pre-line">{group.thesis}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No thesis recorded yet.
        </p>
      )}
    </div>
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
  const [thesis, setThesis] = useState(editingGroup?.thesis ?? "");
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name: name.trim() || null,
      color,
      thesis: thesis.trim() || null,
      targetAllocationPercent:
        targetAllocation === "" ? null : Number(targetAllocation),
      symbols: selectedSymbols,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
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

          <Field>
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
          <Field data-invalid={Boolean(error)}>
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

          <Field>
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

        <Field>
          <FieldLabel htmlFor="group-thesis">Thesis</FieldLabel>
          <Textarea
            id="group-thesis"
            value={thesis}
            onChange={(event) => setThesis(event.target.value)}
            placeholder="Why you own it, catalysts, risks, and what would invalidate the thesis"
            maxLength={MAX_THESIS_LENGTH}
            rows={12}
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
