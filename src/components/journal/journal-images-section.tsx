"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  RiImageAddLine,
  RiLoader4Line,
  RiCloseLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
} from "@remixicon/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  JOURNAL_IMAGE_CONTENT_TYPES,
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
} from "@/lib/journal/images/policy";

const ACCEPTED_TYPES: readonly string[] = JOURNAL_IMAGE_CONTENT_TYPES;
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

type PendingUpload = { id: string; previewUrl: string };
type JournalImageView = {
  id: string;
  blobUrl: string;
  originalFilename: string;
};

function endpointForImage(endpoint: string, imageId: string): string {
  const [pathname, query] = endpoint.split("?", 2);
  return `${pathname}/${imageId}${query ? `?${query}` : ""}`;
}

function imagesFromDataTransfer(
  items: DataTransferItemList | undefined,
): File[] {
  const files: File[] = [];
  // DataTransferItemList is array-like but not iterable, so index by hand
  // rather than using for...of (which throws "items is not iterable").
  for (let i = 0; i < (items?.length ?? 0); i += 1) {
    const item = items![i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export function JournalImagesSection({
  endpoint,
  open,
  disabled,
  onEntryMaterialized,
  onEntryVersionChanged,
  onPendingChange,
  beforeMutation,
}: {
  endpoint: string | null;
  open: boolean;
  disabled: boolean;
  onEntryMaterialized?: () => void;
  onEntryVersionChanged?: (updatedAt: string, entryId?: string) => void;
  onPendingChange?: (pending: boolean) => void;
  beforeMutation?: () => Promise<boolean>;
}) {
  const [images, setImages] = useState<JournalImageView[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset whenever the section targets a different journal owner.
  const activeId = open ? endpoint : null;
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (syncedId !== activeId) {
    setSyncedId(activeId);
    setImages([]);
    setPending([]);
    setRemoving([]);
    setLoading(activeId !== null);
  }

  // Fetch the full image set when its journal editor opens.
  useEffect(() => {
    if (!open || !endpoint) return;

    const controller = new AbortController();
    fetch(endpoint, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load images.");
        return response.json() as Promise<{
          images: JournalImageView[];
          limits: { count: number };
        }>;
      })
      .then((data) => {
        setImages(data.images);
        setLimit(data.limits.count);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.error("Could not load journal images.");
        console.error(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, endpoint]);

  const total = images.length + pending.length;
  const atLimit = limit !== null && total >= limit;
  const mutationPending = pending.length > 0 || removing.length > 0;

  useEffect(() => {
    onPendingChange?.(mutationPending);
    return () => onPendingChange?.(false);
  }, [mutationPending, onPendingChange]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!endpoint || files.length === 0) return;

      const validFiles = files.filter((file) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          toast.error("Upload a PNG, JPEG, or WebP image.");
          return false;
        }
        if (file.size > MAX_JOURNAL_IMAGE_SIZE_BYTES) {
          toast.error("Images must be 4 MiB or smaller.");
          return false;
        }
        return true;
      });
      const remaining =
        limit === null ? validFiles.length : Math.max(0, limit - total);
      if (validFiles.length > remaining) {
        toast.error(`A journal entry can have up to ${limit} images.`);
      }
      const accepted = validFiles.slice(0, remaining);
      if (accepted.length === 0) return;
      if (beforeMutation && !(await beforeMutation())) return;

      for (const file of accepted) {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        setPending((prev) => [...prev, { id, previewUrl }]);

        const body = new FormData();
        body.append("file", file);

        try {
          const response = await fetch(endpoint, { method: "POST", body });
          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            toast.error(data?.error ?? "The image could not be uploaded.");
            continue;
          }
          const data = (await response.json()) as {
            image: JournalImageView;
            entryId?: string;
            entryUpdatedAt?: string;
          };
          setImages((prev) => [...prev, data.image]);
          // The upload creates the journal entry row on first image, so let the
          // sheet flip from "Add" to "Edit".
          onEntryMaterialized?.();
          if (data.entryId && data.entryUpdatedAt) {
            onEntryVersionChanged?.(data.entryUpdatedAt, data.entryId);
          }
        } catch (error) {
          toast.error("The image could not be uploaded.");
          console.error(error);
        } finally {
          URL.revokeObjectURL(previewUrl);
          setPending((prev) => prev.filter((item) => item.id !== id));
        }
      }
    },
    [
      beforeMutation,
      endpoint,
      limit,
      onEntryMaterialized,
      onEntryVersionChanged,
      total,
    ],
  );

  // A document-level paste listener means the user can take a screenshot and
  // hit Ctrl+V anywhere in the sheet without first focusing a field.
  useEffect(() => {
    if (!open || !endpoint || disabled || loading || mutationPending) return;

    function handlePaste(event: ClipboardEvent) {
      const files = imagesFromDataTransfer(event.clipboardData?.items);
      if (files.length === 0) return;
      event.preventDefault();
      void upload(files);
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, endpoint, disabled, loading, mutationPending, upload]);

  async function remove(image: JournalImageView) {
    if (!endpoint) return;
    if (beforeMutation && !(await beforeMutation())) return;
    const previous = images;
    setImages((prev) => prev.filter((item) => item.id !== image.id));
    setRemoving((current) => [...current, image.id]);

    try {
      const response = await fetch(
        endpointForImage(endpoint, image.id),
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error("Failed to delete image.");
      }
      if (response.ok && response.status !== 204) {
        const data = (await response.json()) as { entryUpdatedAt?: string };
        if (data.entryUpdatedAt) {
          onEntryVersionChanged?.(data.entryUpdatedAt);
        }
      }
    } catch (error) {
      setImages(previous);
      toast.error("The image could not be removed.");
      console.error(error);
    } finally {
      setRemoving((current) => current.filter((id) => id !== image.id));
    }
  }

  const showPrev = useCallback(() => {
    setViewerIndex((current) => {
      if (current === null || images.length === 0) return current;
      return (current - 1 + images.length) % images.length;
    });
  }, [images.length]);

  const showNext = useCallback(() => {
    setViewerIndex((current) => {
      if (current === null || images.length === 0) return current;
      return (current + 1) % images.length;
    });
  }, [images.length]);

  // Radix's Dialog already closes on Escape; this only adds arrow-key paging.
  useEffect(() => {
    if (viewerIndex === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [viewerIndex, showPrev, showNext]);

  const viewerImage = viewerIndex !== null ? images[viewerIndex] : null;

  const interactionDisabled = disabled || loading || atLimit || mutationPending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Screenshots</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            disabled={interactionDisabled}
            aria-label="Add screenshots"
            onClick={() => fileInputRef.current?.click()}
          >
            <RiImageAddLine />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void upload(files);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-md border"
            >
              <button
                type="button"
                onClick={() => setViewerIndex(index)}
                aria-label={`View screenshot: ${image.originalFilename}`}
                className="block size-full cursor-pointer"
              >
                {/* Blob URLs aren't in next/image's allowlist, so use a plain img. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.blobUrl}
                  alt={image.originalFilename}
                  className="size-full object-cover transition-opacity group-hover:opacity-90"
                />
              </button>
              <button
                type="button"
                disabled={disabled || mutationPending}
                onClick={() => void remove(image)}
                aria-label="Remove screenshot"
                className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
              >
                <RiCloseLine className="size-3.5" />
              </button>
            </div>
          ))}
          {pending.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt="Uploading screenshot"
                className="size-full object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <RiLoader4Line className="size-5 animate-spin text-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={viewerIndex !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setViewerIndex(null);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw]">
          <DialogTitle className="sr-only">
            {viewerImage?.originalFilename ?? "Screenshot"}
          </DialogTitle>
          {viewerImage && (
            <div className="flex flex-col items-center gap-2">
              <div className="relative flex w-full items-center justify-center">
                {images.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={showPrev}
                    aria-label="Previous screenshot"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                  >
                    <RiArrowLeftSLine />
                  </Button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewerImage.blobUrl}
                  alt={viewerImage.originalFilename}
                  className="max-h-[95vh] w-auto max-w-full rounded-md object-contain"
                />
                {images.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={showNext}
                    aria-label="Next screenshot"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <RiArrowRightSLine />
                  </Button>
                )}
              </div>
              {images.length > 1 && (
                <span className="text-sm text-muted-foreground">
                  {(viewerIndex ?? 0) + 1} / {images.length}
                </span>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
