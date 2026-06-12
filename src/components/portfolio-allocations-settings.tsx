"use client";

import {
  RiAddLine,
  RiDeleteBinLine,
  RiPencilLine,
  RiSettings3Line,
} from "@remixicon/react";
import { useState, useTransition } from "react";

import { createGroup, deleteGroup, updateGroup } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { usePortfolioSettings } from "@/components/portfolio-settings-context";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ASSET_CHART_COLORS,
  groupLabel,
  type AssetGroup,
} from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

type EditorState =
  | { mode: "idle" }
  | { mode: "create" }
  | { mode: "edit"; groupId: string };

type GroupFormValues = {
  name: string | null;
  color: string | null;
  symbols: string[];
};

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function PortfolioAllocationsSettings() {
  const { groups, availableSymbols, setGroups } = usePortfolioSettings();
  const [editor, setEditor] = useState<EditorState>({ mode: "idle" });

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditor({ mode: "idle" });
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Portfolio overview settings"
        >
          <RiSettings3Line />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Portfolio Settings</SheetTitle>
          <SheetDescription>
            Group assets into a single line item
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <AssetGroupManager
            groups={groups}
            availableSymbols={availableSymbols}
            onGroupsChange={setGroups}
            editor={editor}
            setEditor={setEditor}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AssetGroupManager({
  groups,
  availableSymbols,
  onGroupsChange,
  editor,
  setEditor,
}: {
  groups: AssetGroup[];
  availableSymbols: string[];
  onGroupsChange: (groups: AssetGroup[]) => void;
  editor: EditorState;
  setEditor: (state: EditorState) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(groupId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroup(groupId);
      onGroupsChange(result.groups);
      if (result.error) setError(result.error);
      else setEditor({ mode: "idle" });
    });
  }

  if (availableSymbols.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Refresh your portfolio to start grouping assets.
      </p>
    );
  }

  const editingGroup =
    editor.mode === "edit"
      ? groups.find((group) => group.id === editor.groupId)
      : undefined;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Asset groups</h3>
          {editor.mode === "idle" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setEditor({ mode: "create" });
              }}
            >
              <RiAddLine data-icon="inline-start" />
              New group
            </Button>
          ) : null}
        </div>

        {groups.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li
                key={group.id}
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    {group.color ? (
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: group.color }}
                      />
                    ) : null}
                    <span className="truncate">
                      {groupLabel(group.name, group.symbols)}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {group.symbols.map((symbol) => (
                      <Badge key={symbol} variant="secondary">
                        {symbol}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${groupLabel(group.name, group.symbols)}`}
                    disabled={isPending || editor.mode !== "idle"}
                    onClick={() => {
                      setError(null);
                      setEditor({ mode: "edit", groupId: group.id });
                    }}
                  >
                    <RiPencilLine />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${groupLabel(group.name, group.symbols)}`}
                    disabled={isPending || editor.mode !== "idle"}
                    onClick={() => handleDelete(group.id)}
                  >
                    <RiDeleteBinLine />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : editor.mode === "idle" ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No groups yet.
          </p>
        ) : null}
      </section>

      {editor.mode !== "idle" ? (
        <>
          <Separator />
          <GroupEditor
            key={editor.mode === "edit" ? editor.groupId : "create"}
            groups={groups}
            availableSymbols={availableSymbols}
            editingGroup={editingGroup}
            onCancel={() => {
              setError(null);
              setEditor({ mode: "idle" });
            }}
            onSubmit={(values) =>
              startTransition(async () => {
                const result = editingGroup
                  ? await updateGroup(editingGroup.id, values)
                  : await createGroup(values);
                onGroupsChange(result.groups);
                if (result.error) setError(result.error);
                else setEditor({ mode: "idle" });
              })
            }
            isPending={isPending}
            error={error}
          />
        </>
      ) : null}
    </div>
  );
}

function GroupEditor({
  groups,
  availableSymbols,
  editingGroup,
  onCancel,
  onSubmit,
  isPending,
  error,
}: {
  groups: AssetGroup[];
  availableSymbols: string[];
  editingGroup: AssetGroup | undefined;
  onCancel: () => void;
  onSubmit: (values: GroupFormValues) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(editingGroup?.name ?? "");
  const [color, setColor] = useState<string | null>(
    editingGroup?.color ?? null,
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
  // so dedupe by key — one checkbox represents every holding of that symbol.
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbols = selectableSymbols.filter((symbol) =>
      selected.has(symbolKey(symbol)),
    );
    onSubmit({ name: name.trim() || null, color, symbols });
  }

  const selectedCount = selectableSymbols.filter((symbol) =>
    selected.has(symbolKey(symbol)),
  ).length;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h3 className="text-sm font-medium">
        {editingGroup ? "Edit group" : "New group"}
      </h3>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="group-name">Name (optional)</FieldLabel>
          <Input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Defaults to the joined symbols"
            autoComplete="off"
            disabled={isPending}
          />
          <FieldDescription>
            Leave blank to label the group by its assets (e.g. “HYPE + sHYPE”).
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Color (optional)</FieldLabel>
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

        <Field data-invalid={Boolean(error)}>
          <FieldLabel>Assets ({selectedCount} selected)</FieldLabel>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {selectableSymbols.map((symbol) => {
              const key = symbolKey(symbol);
              const id = `group-symbol-${key}`;
              return (
                <li key={key}>
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={selected.has(key)}
                      onCheckedChange={() => toggleSymbol(symbol)}
                      disabled={isPending}
                    />
                    <span className="truncate font-medium">{symbol}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || selectedCount < 1}>
          {editingGroup ? "Save group" : "Create group"}
        </Button>
      </div>
    </form>
  );
}
