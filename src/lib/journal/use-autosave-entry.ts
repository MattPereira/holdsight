"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const AUTOSAVE_DEBOUNCE_MS = 750;
const SAVE_RETRY_DELAY_MS = 3_000;

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export type SaveResult<TEntry> =
  | { status: "saved"; entry: TEntry | null }
  | { status: "conflict"; entry: TEntry }
  | { status: "error"; message: string };

/**
 * Unifies the autosave/save-queue/conflict-resolution engine shared by the
 * Investment Journal Entry and Transaction Journal Entry editors. Persistence
 * is injected as a port (`save`) so this module never knows which journal
 * type it's driving.
 *
 * `key` identifies the entry being edited (e.g. `${periodType}:${periodStart}`
 * or a transaction id). Changing it resets local state and guarantees a save
 * in flight for the previous key can never clobber state for the new one.
 */
export function useAutosaveEntry<TDraft, TEntry extends { updatedAt: string }>({
  key,
  initialEntry,
  enabled = true,
  draftFromEntry,
  sameDraft,
  save,
  onEntryChange,
}: {
  key: string;
  initialEntry: TEntry | null;
  /** When false, draft edits are tracked but autosave never fires. */
  enabled?: boolean;
  draftFromEntry: (entry: TEntry | null) => TDraft;
  sameDraft: (a: TDraft, b: TDraft) => boolean;
  /** `currentEntry` is whatever this module currently holds (null if the
   * entry doesn't exist yet) — pull `id`/`updatedAt` off it as needed. */
  save: (
    snapshot: TDraft,
    currentEntry: TEntry | null,
    overwrite: boolean,
  ) => Promise<SaveResult<TEntry>>;
  /** Fires whenever the persisted entry changes: save, conflict resolution,
   * external sync (e.g. image upload), or delete (via `applyServerEntry`). */
  onEntryChange?: (entry: TEntry | null, previousEntry: TEntry | null) => void;
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [draft, setDraftState] = useState(() => draftFromEntry(initialEntry));
  const [persistedDraft, setPersistedDraft] = useState(() =>
    draftFromEntry(initialEntry),
  );
  const [status, setStatus] = useState<SaveStatus>(
    initialEntry ? "saved" : "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverConflict, setServerConflict] = useState<TEntry | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  const keyRef = useRef(key);
  const entryRef = useRef(entry);
  const draftRef = useRef(draft);
  const enqueuedFingerprintsRef = useRef(new Set<string>());
  const saveQueueRef = useRef(Promise.resolve());

  // Latest-value refs for the caller-supplied functions, kept fresh via
  // effect (not mutated during render) so async callbacks never read a
  // stale closure and `runSave`'s identity doesn't depend on caller
  // memoization.
  const saveRef = useRef(save);
  const sameDraftRef = useRef(sameDraft);
  const draftFromEntryRef = useRef(draftFromEntry);
  const onEntryChangeRef = useRef(onEntryChange);
  useEffect(() => {
    saveRef.current = save;
    sameDraftRef.current = sameDraft;
    draftFromEntryRef.current = draftFromEntry;
    onEntryChangeRef.current = onEntryChange;
  }, [save, sameDraft, draftFromEntry, onEntryChange]);

  // Reset local state whenever the target identity changes, during render
  // (mirrors the render-phase sync already used elsewhere in the Journal
  // components) so no stale-key save can land after the switch. Refs are
  // synced separately by effect below — mutating them during render isn't
  // allowed, but by the time any event handler or timer can run, the
  // effects have already committed.
  const [syncedKey, setSyncedKey] = useState(key);
  if (syncedKey !== key) {
    setSyncedKey(key);
    const nextDraft = draftFromEntry(initialEntry);
    setEntry(initialEntry);
    setDraftState(nextDraft);
    setPersistedDraft(nextDraft);
    setStatus(initialEntry ? "saved" : "idle");
    setSaveError(null);
    setServerConflict(null);
  }

  useEffect(() => {
    keyRef.current = key;
    enqueuedFingerprintsRef.current.clear();
    saveQueueRef.current = Promise.resolve();
  }, [key]);
  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const dirty = !sameDraft(draft, persistedDraft);

  const runSave = useCallback(
    (snapshot: TDraft, overwrite = false): Promise<boolean> => {
      const savingKey = keyRef.current;
      const fingerprint = JSON.stringify(snapshot);
      enqueuedFingerprintsRef.current.add(fingerprint);
      setStatus("saving");
      setSaveError(null);

      const operation = saveQueueRef.current.then(async () => {
        if (keyRef.current !== savingKey) return false;
        setStatus("saving");

        let result: SaveResult<TEntry>;
        try {
          result = await saveRef.current(snapshot, entryRef.current, overwrite);
        } catch {
          result = {
            status: "error",
            message: "The server could not be reached.",
          };
        }
        if (keyRef.current !== savingKey) return false;

        if (result.status === "conflict") {
          enqueuedFingerprintsRef.current.delete(fingerprint);
          setServerConflict(result.entry);
          setStatus("conflict");
          return false;
        }
        if (result.status === "error") {
          setSaveError(result.message);
          setStatus("error");
          window.setTimeout(() => {
            enqueuedFingerprintsRef.current.delete(fingerprint);
            setRetryVersion((version) => version + 1);
          }, SAVE_RETRY_DELAY_MS);
          return false;
        }

        const previousEntry = entryRef.current;
        setEntry(result.entry);
        entryRef.current = result.entry;
        setPersistedDraft(snapshot);
        enqueuedFingerprintsRef.current.delete(fingerprint);
        setStatus(
          sameDraftRef.current(draftRef.current, snapshot) ? "saved" : "idle",
        );
        onEntryChangeRef.current?.(result.entry, previousEntry);
        return true;
      });
      saveQueueRef.current = operation.then(() => undefined);
      return operation;
    },
    [],
  );

  // Debounced autosave: fires AUTOSAVE_DEBOUNCE_MS after the draft settles,
  // skipped while a conflict is unresolved or while this exact snapshot is
  // already enqueued (e.g. a retry after a transient error).
  useEffect(() => {
    if (!enabled || status === "conflict" || !dirty) return;
    const fingerprint = JSON.stringify(draft);
    if (enqueuedFingerprintsRef.current.has(fingerprint)) return;
    const timer = window.setTimeout(
      () => void runSave(draft),
      AUTOSAVE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dirty, draft, enabled, retryVersion, runSave, status]);

  const setDraft = useCallback(
    (updater: TDraft | ((current: TDraft) => TDraft)) => {
      const next =
        typeof updater === "function"
          ? (updater as (current: TDraft) => TDraft)(draftRef.current)
          : updater;
      draftRef.current = next;
      setDraftState(next);
      setStatus((current) => (current === "conflict" ? "conflict" : "idle"));
    },
    [],
  );

  const commitNow = useCallback(() => {
    void runSave(draftRef.current);
  }, [runSave]);

  /** Supplies the initial entry when it isn't known synchronously (e.g. a
   * sheet that fetches after opening). Sets the baseline without treating it
   * as a change — `onEntryChange` does not fire, since nothing actually
   * changed, we just learned what was already true. */
  const hydrate = useCallback((nextEntry: TEntry | null) => {
    const nextDraft = draftFromEntryRef.current(nextEntry);
    entryRef.current = nextEntry;
    draftRef.current = nextDraft;
    setEntry(nextEntry);
    setDraftState(nextDraft);
    setPersistedDraft(nextDraft);
    setStatus(nextEntry ? "saved" : "idle");
  }, []);

  const applyServerEntry = useCallback((nextEntry: TEntry | null) => {
    const previousEntry = entryRef.current;
    const nextDraft = draftFromEntryRef.current(nextEntry);
    entryRef.current = nextEntry;
    draftRef.current = nextDraft;
    setEntry(nextEntry);
    setDraftState(nextDraft);
    setPersistedDraft(nextDraft);
    setServerConflict(null);
    setSaveError(null);
    setStatus(nextEntry ? "saved" : "idle");
    enqueuedFingerprintsRef.current.clear();
    onEntryChangeRef.current?.(nextEntry, previousEntry);
  }, []);

  const reloadServerVersion = useCallback(() => {
    if (!serverConflict) return;
    applyServerEntry(serverConflict);
  }, [applyServerEntry, serverConflict]);

  const overwriteServerVersion = useCallback(() => {
    if (!serverConflict) return;
    entryRef.current = serverConflict;
    setEntry(serverConflict);
    setServerConflict(null);
    void runSave(draftRef.current, true);
  }, [runSave, serverConflict]);

  /** Applies an entry update that happened outside the save queue entirely
   * (e.g. a journal image upload materialized the parent entry row). If an
   * entry already exists, only `updatedAt` changes; otherwise `materialize`
   * builds the brand-new entry from the current draft and the supplied id. */
  const syncEntryVersion = useCallback(
    (
      updatedAt: string,
      entryId: string | undefined,
      materialize: (draft: TDraft, id: string) => TEntry,
    ) => {
      const previousEntry = entryRef.current;
      let nextEntry: TEntry;
      if (previousEntry) {
        nextEntry = { ...previousEntry, updatedAt };
      } else {
        if (!entryId) return;
        nextEntry = materialize(draftRef.current, entryId);
      }
      entryRef.current = nextEntry;
      setEntry(nextEntry);
      if (!previousEntry) {
        // Materialized by the external mutation: the current draft is
        // already what's persisted server-side.
        setPersistedDraft(draftRef.current);
      }
      setStatus("saved");
      onEntryChangeRef.current?.(nextEntry, previousEntry);
    },
    [],
  );

  const flushBeforeMutation = useCallback(async (): Promise<boolean> => {
    if (status === "conflict" || status === "error") return false;
    if (dirty || status === "saving") return runSave(draftRef.current);
    await saveQueueRef.current;
    return true;
  }, [dirty, runSave, status]);

  return {
    draft,
    entry,
    status,
    dirty,
    saveError,
    setDraft,
    commitNow,
    hydrate,
    reloadServerVersion,
    overwriteServerVersion,
    applyServerEntry,
    syncEntryVersion,
    flushBeforeMutation,
  };
}
