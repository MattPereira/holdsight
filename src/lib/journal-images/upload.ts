import "server-only";

import { del, put } from "@vercel/blob";

import { enqueueBlobDeletion } from "@/lib/blob/deletion-jobs";
import {
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
  type JournalImageContentType,
} from "@/lib/journal-images/policy";

export {
  JOURNAL_IMAGE_CONTENT_TYPES,
  MAX_JOURNAL_IMAGE_COUNT,
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
} from "@/lib/journal-images/policy";

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type { JournalImageContentType } from "@/lib/journal-images/policy";

export type JournalImageUploadError =
  | "invalid_file"
  | "invalid_image_type"
  | "image_too_large"
  | "image_limit_reached"
  | "entry_not_found"
  | "upload_failed";

type JournalImageValidationError =
  | "invalid_file"
  | "invalid_image_type"
  | "image_too_large";

function matchesSignature(
  contentType: JournalImageContentType,
  bytes: Uint8Array,
): boolean {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function validateJournalImage(file: File): Promise<
  | {
      contentType: JournalImageContentType;
      extension: string;
      originalFilename: string;
    }
  | { error: JournalImageValidationError }
> {
  if (file.size === 0) return { error: "invalid_file" };
  if (file.size > MAX_JOURNAL_IMAGE_SIZE_BYTES) {
    return { error: "image_too_large" };
  }
  if (!(file.type in IMAGE_TYPES)) return { error: "invalid_image_type" };

  const contentType = file.type as JournalImageContentType;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesSignature(contentType, bytes)) {
    return { error: "invalid_image_type" };
  }

  const extension = IMAGE_TYPES[contentType];
  const normalizedFilename = file.name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return {
    contentType,
    extension,
    originalFilename: normalizedFilename || `chart.${extension}`,
  };
}

export async function uploadJournalImageBlob(
  pathname: string,
  file: File,
  contentType: JournalImageContentType,
): Promise<{ pathname: string; url: string } | null> {
  try {
    return await put(pathname, file, { access: "public", contentType });
  } catch (error) {
    console.error("Failed to upload journal image", error);
    return null;
  }
}

export async function rollbackJournalImageUpload(
  blobPathname: string,
): Promise<void> {
  try {
    await del(blobPathname);
  } catch (deleteError) {
    console.error("Failed to roll back journal image Blob upload", deleteError);
    try {
      await enqueueBlobDeletion(blobPathname);
    } catch (enqueueError) {
      console.error("Failed to enqueue journal image Blob cleanup", enqueueError);
    }
  }
}
