"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RiImageAddLine, RiLoader4Line, RiCloseLine } from "@remixicon/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { InvestmentTransactionJournalImage } from "@/lib/investment-transactions/journal-images";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

type PendingUpload = { id: string; previewUrl: string };

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
  transactionId,
  open,
  disabled,
  onEntryMaterialized,
}: {
  transactionId: string | null;
  open: boolean;
  disabled: boolean;
  onEntryMaterialized?: () => void;
}) {
  const [images, setImages] = useState<InvestmentTransactionJournalImage[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset whenever the section targets a new transaction, mirroring the
  // render-phase sync the sheet uses for its form state.
  const activeId = open ? transactionId : null;
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (syncedId !== activeId) {
    setSyncedId(activeId);
    setImages([]);
    setPending([]);
    setLoading(activeId !== null);
  }

  // Fetch the existing images for the entry. Only a lightweight summary ships
  // with the transaction list, so the full set is loaded here on open.
  useEffect(() => {
    if (!open || !transactionId) return;

    const controller = new AbortController();
    fetch(`/api/investment-transactions/${transactionId}/journal-images`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load images.");
        return response.json() as Promise<{
          images: InvestmentTransactionJournalImage[];
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
  }, [open, transactionId]);

  const total = images.length + pending.length;
  const atLimit = limit !== null && total >= limit;

  const upload = useCallback(
    async (files: File[]) => {
      if (!transactionId || files.length === 0) return;

      const accepted = files.filter((file) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          toast.error("Upload a PNG, JPEG, or WebP image.");
          return false;
        }
        return true;
      });

      for (const file of accepted) {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        setPending((prev) => [...prev, { id, previewUrl }]);

        const body = new FormData();
        body.append("file", file);

        try {
          const response = await fetch(
            `/api/investment-transactions/${transactionId}/journal-images`,
            { method: "POST", body },
          );
          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            toast.error(data?.error ?? "The image could not be uploaded.");
            continue;
          }
          const { image } = (await response.json()) as {
            image: InvestmentTransactionJournalImage;
          };
          setImages((prev) => [...prev, image]);
          // The upload creates the journal entry row on first image, so let the
          // sheet flip from "Add" to "Edit".
          onEntryMaterialized?.();
        } catch (error) {
          toast.error("The image could not be uploaded.");
          console.error(error);
        } finally {
          URL.revokeObjectURL(previewUrl);
          setPending((prev) => prev.filter((item) => item.id !== id));
        }
      }
    },
    [transactionId, onEntryMaterialized],
  );

  // A document-level paste listener means the user can take a screenshot and
  // hit Ctrl+V anywhere in the sheet without first focusing a field.
  useEffect(() => {
    if (!open || !transactionId || disabled) return;

    function handlePaste(event: ClipboardEvent) {
      const files = imagesFromDataTransfer(event.clipboardData?.items);
      if (files.length === 0) return;
      event.preventDefault();
      void upload(files);
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, transactionId, disabled, upload]);

  async function remove(image: InvestmentTransactionJournalImage) {
    if (!transactionId) return;
    const previous = images;
    setImages((prev) => prev.filter((item) => item.id !== image.id));

    try {
      const response = await fetch(
        `/api/investment-transactions/${transactionId}/journal-images/${image.id}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error("Failed to delete image.");
      }
    } catch (error) {
      setImages(previous);
      toast.error("The image could not be removed.");
      console.error(error);
    }
  }

  const interactionDisabled = disabled || atLimit;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Screenshots</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={interactionDisabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <RiImageAddLine />
            Browse
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
        <div className="flex flex-col gap-2">
          <Skeleton className="aspect-video w-full rounded-md" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-md border"
            >
              {/* Blob URLs aren't in next/image's allowlist, so use a plain img. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.blobUrl}
                alt={image.originalFilename}
                className="h-auto w-full object-contain"
              />
              <button
                type="button"
                disabled={disabled}
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
              className="relative overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt="Uploading screenshot"
                className="h-auto w-full object-contain opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <RiLoader4Line className="size-5 animate-spin text-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
