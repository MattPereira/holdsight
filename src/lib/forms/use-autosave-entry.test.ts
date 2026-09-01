import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_DEBOUNCE_MS,
  type SaveResult,
  useAutosaveEntry,
} from "./use-autosave-entry";

type Entry = { id: string; updatedAt: string; value: string };
type Draft = { value: string };

function draftFromEntry(entry: Entry | null): Draft {
  return { value: entry?.value ?? "" };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.value === b.value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderAutosave(
  overrides: Partial<Parameters<typeof useAutosaveEntry<Draft, Entry>>[0]> & {
    key: string;
  },
) {
  return renderHook(
    (props: { key: string }) =>
      useAutosaveEntry<Draft, Entry>({
        initialEntry: null,
        draftFromEntry,
        sameDraft,
        save: vi.fn(),
        ...overrides,
        key: props.key,
      }),
    { initialProps: { key: overrides.key } },
  );
}

describe("useAutosaveEntry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks draft edits and flips dirty via sameDraft", () => {
    const { result } = renderAutosave({ key: "a" });

    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.setDraft({ value: "hello" });
    });

    expect(result.current.draft).toEqual({ value: "hello" });
    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.setDraft({ value: "" });
    });

    expect(result.current.dirty).toBe(false);
  });

  it("debounces autosave and coalesces rapid edits into one save", async () => {
    const save = vi.fn(
      async (): Promise<SaveResult<Entry>> => ({
        status: "saved",
        entry: { id: "1", updatedAt: "t1", value: "hel" },
      }),
    );
    const { result } = renderAutosave({ key: "a", save });

    act(() => {
      result.current.setDraft({ value: "h" });
    });
    act(() => {
      result.current.setDraft({ value: "he" });
    });
    act(() => {
      result.current.setDraft({ value: "hel" });
    });

    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ value: "hel" }, null, false);
    expect(result.current.status).toBe("saved");
  });

  it("commitNow flushes without waiting for the debounce", async () => {
    const save = vi.fn(
      async (): Promise<SaveResult<Entry>> => ({
        status: "saved",
        entry: { id: "1", updatedAt: "t1", value: "x" },
      }),
    );
    const { result } = renderAutosave({ key: "a", save });

    act(() => {
      result.current.setDraft({ value: "x" });
    });

    await act(async () => {
      result.current.commitNow();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
    expect(result.current.dirty).toBe(false);
  });

  it("surfaces a conflict and pauses further autosave", async () => {
    const conflictEntry: Entry = { id: "1", updatedAt: "t2", value: "server" };
    const save = vi.fn(
      async (): Promise<SaveResult<Entry>> => ({
        status: "conflict",
        entry: conflictEntry,
      }),
    );
    const { result } = renderAutosave({ key: "a", save });

    act(() => {
      result.current.setDraft({ value: "mine" });
    });

    await act(async () => {
      result.current.commitNow();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("conflict");
    expect(result.current.dirty).toBe(true);

    save.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("reloadServerVersion resets draft/entry to the server's version", async () => {
    const conflictEntry: Entry = { id: "1", updatedAt: "t2", value: "server" };
    const save = vi.fn(
      async (): Promise<SaveResult<Entry>> => ({
        status: "conflict",
        entry: conflictEntry,
      }),
    );
    const { result } = renderAutosave({ key: "a", save });

    act(() => {
      result.current.setDraft({ value: "mine" });
    });
    await act(async () => {
      result.current.commitNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("conflict");

    act(() => {
      result.current.reloadServerVersion();
    });

    expect(result.current.entry).toEqual(conflictEntry);
    expect(result.current.draft).toEqual({ value: "server" });
    expect(result.current.dirty).toBe(false);
    expect(result.current.status).toBe("saved");
  });

  it("overwriteServerVersion re-saves the local draft and resolves the conflict", async () => {
    const conflictEntry: Entry = { id: "1", updatedAt: "t2", value: "server" };
    const savedEntry: Entry = { id: "1", updatedAt: "t3", value: "mine" };
    const save = vi
      .fn<
        (
          snapshot: Draft,
          currentEntry: Entry | null,
          overwrite: boolean,
        ) => Promise<SaveResult<Entry>>
      >()
      .mockResolvedValueOnce({ status: "conflict", entry: conflictEntry })
      .mockResolvedValueOnce({ status: "saved", entry: savedEntry });

    const { result } = renderAutosave({ key: "a", save });

    act(() => {
      result.current.setDraft({ value: "mine" });
    });
    await act(async () => {
      result.current.commitNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("conflict");

    await act(async () => {
      result.current.overwriteServerVersion();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, { value: "mine" }, conflictEntry, true);
    expect(result.current.entry).toEqual(savedEntry);
    expect(result.current.status).toBe("saved");
    expect(result.current.dirty).toBe(false);
  });

  it("does not let a stale in-flight save clobber state after the key changes", async () => {
    const staleSave = deferred<SaveResult<Entry>>();
    const save = vi.fn().mockReturnValueOnce(staleSave.promise);
    const { result, rerender } = renderAutosave({ key: "a", save });

    act(() => {
      result.current.setDraft({ value: "for-a" });
    });
    await act(async () => {
      result.current.commitNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("saving");
    expect(save).toHaveBeenCalledTimes(1);

    rerender({ key: "b" });
    expect(result.current.status).toBe("idle");
    expect(result.current.entry).toBeNull();
    expect(result.current.draft).toEqual({ value: "" });

    await act(async () => {
      staleSave.resolve({
        status: "saved",
        entry: { id: "a", updatedAt: "t1", value: "for-a" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.entry).toBeNull();
    expect(result.current.draft).toEqual({ value: "" });
  });

  it("applyServerEntry resets draft/entry/dirty to reflect a given server entry", () => {
    const { result } = renderAutosave({ key: "a" });

    act(() => {
      result.current.setDraft({ value: "unsaved edit" });
    });
    expect(result.current.dirty).toBe(true);

    const serverEntry: Entry = { id: "1", updatedAt: "t1", value: "from server" };
    act(() => {
      result.current.applyServerEntry(serverEntry);
    });

    expect(result.current.entry).toEqual(serverEntry);
    expect(result.current.draft).toEqual({ value: "from server" });
    expect(result.current.dirty).toBe(false);
    expect(result.current.status).toBe("saved");

    act(() => {
      result.current.applyServerEntry(null);
    });

    expect(result.current.entry).toBeNull();
    expect(result.current.draft).toEqual({ value: "" });
    expect(result.current.status).toBe("idle");
  });

  describe("flushBeforeMutation", () => {
    it("bails when status is conflict", async () => {
      const save = vi.fn(
        async (): Promise<SaveResult<Entry>> => ({
          status: "conflict",
          entry: { id: "1", updatedAt: "t2", value: "server" },
        }),
      );
      const { result } = renderAutosave({ key: "a", save });

      act(() => {
        result.current.setDraft({ value: "mine" });
      });
      await act(async () => {
        result.current.commitNow();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("conflict");

      save.mockClear();
      let flushResult: boolean | undefined;
      await act(async () => {
        flushResult = await result.current.flushBeforeMutation();
      });

      expect(flushResult).toBe(false);
      expect(save).not.toHaveBeenCalled();
    });

    it("bails when status is error", async () => {
      const save = vi.fn(
        async (): Promise<SaveResult<Entry>> => ({
          status: "error",
          message: "The server could not be reached.",
        }),
      );
      const { result } = renderAutosave({ key: "a", save });

      act(() => {
        result.current.setDraft({ value: "mine" });
      });
      await act(async () => {
        result.current.commitNow();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("error");

      save.mockClear();
      let flushResult: boolean | undefined;
      await act(async () => {
        flushResult = await result.current.flushBeforeMutation();
      });

      expect(flushResult).toBe(false);
      expect(save).not.toHaveBeenCalled();
    });

    it("forces a save when dirty", async () => {
      const save = vi.fn(
        async (): Promise<SaveResult<Entry>> => ({
          status: "saved",
          entry: { id: "1", updatedAt: "t1", value: "mine" },
        }),
      );
      const { result } = renderAutosave({ key: "a", save });

      act(() => {
        result.current.setDraft({ value: "mine" });
      });

      let flushResult: boolean | undefined;
      await act(async () => {
        flushResult = await result.current.flushBeforeMutation();
      });

      expect(flushResult).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      expect(result.current.dirty).toBe(false);
    });

    it("awaits the existing queue when not dirty and not saving", async () => {
      const save = vi.fn(
        async (): Promise<SaveResult<Entry>> => ({
          status: "saved",
          entry: { id: "1", updatedAt: "t1", value: "mine" },
        }),
      );
      const { result } = renderAutosave({ key: "a", save });

      act(() => {
        result.current.setDraft({ value: "mine" });
      });
      await act(async () => {
        result.current.commitNow();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.dirty).toBe(false);

      save.mockClear();
      let flushResult: boolean | undefined;
      await act(async () => {
        flushResult = await result.current.flushBeforeMutation();
      });

      expect(flushResult).toBe(true);
      expect(save).not.toHaveBeenCalled();
    });
  });
});
