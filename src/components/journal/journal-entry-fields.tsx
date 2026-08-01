"use client";

import type { ReactNode } from "react";
import { RiRefreshLine } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { SaveStatus } from "@/lib/journal/use-autosave-entry";
import { cn } from "@/lib/utils";

/** Mirrors MAX_JOURNAL_TEXT_LENGTH, which lives in a server-only module. */
const MAX_LENGTH = 10_000;

export type JournalDraft = { plan: string; reflection: string };

/**
 * The Plan/Notes pair for one Investment Journal Entry, plus the save-failure
 * and edit-conflict surfaces that belong with them. Deliberately frame-less:
 * the dedicated Journal page renders it bare while the Portfolio page wraps it
 * in a card, and neither owns the other's chrome.
 *
 * Two entries can be on screen at once (the Portfolio page shows today and
 * this week), so field ids are namespaced by `idPrefix` rather than hardcoded.
 *
 * `children` renders between the fields and the status cards — that's where
 * the Journal page puts its screenshots section.
 */
export function JournalEntryFields({
  idPrefix,
  draft,
  onDraftChange,
  status,
  saveError,
  onReloadServerVersion,
  onOverwriteServerVersion,
  textareaClassName,
  headingClassName,
  children,
}: {
  idPrefix: string;
  draft: JournalDraft;
  onDraftChange: (updater: (current: JournalDraft) => JournalDraft) => void;
  status: SaveStatus;
  saveError: string | null;
  onReloadServerVersion: () => void;
  onOverwriteServerVersion: () => void;
  /** Height/resize classes for both textareas — the two callers differ here. */
  textareaClassName?: string;
  headingClassName?: string;
  children?: ReactNode;
}) {
  const planId = `${idPrefix}-plan`;
  const reflectionId = `${idPrefix}-reflection`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className={cn("font-medium", headingClassName)}>Plan</h2>
          <Field>
            <FieldLabel className="sr-only" htmlFor={planId}>
              Plan
            </FieldLabel>
            <Textarea
              id={planId}
              className={cn("min-h-72 resize-y", textareaClassName)}
              maxLength={MAX_LENGTH}
              value={draft.plan}
              placeholder="What is your plan for this period?"
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  plan: event.target.value,
                }))
              }
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className={cn("font-medium", headingClassName)}>Notes</h2>
          <Field>
            <FieldLabel className="sr-only" htmlFor={reflectionId}>
              Notes
            </FieldLabel>
            <Textarea
              id={reflectionId}
              className={cn("min-h-72 resize-y", textareaClassName)}
              maxLength={MAX_LENGTH}
              value={draft.reflection}
              placeholder="What happened and what did you learn?"
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  reflection: event.target.value,
                }))
              }
            />
          </Field>
        </div>
      </div>

      {children}

      {status === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle>Save failed</CardTitle>
            <CardDescription>
              {saveError} Your visible edits are preserved and the save will
              retry while this page remains open.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {status === "conflict" ? (
        <Card>
          <CardHeader>
            <CardTitle>This entry changed elsewhere</CardTitle>
            <CardDescription>
              Autosave is paused. Your local edits remain visible until you
              choose a version.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-wrap">
            <Button variant="outline" onClick={onReloadServerVersion}>
              <RiRefreshLine data-icon="inline-start" />
              Reload server version
            </Button>
            <Button onClick={onOverwriteServerVersion}>
              Overwrite with my edits
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
