export const MAX_JOURNAL_IMAGE_COUNT = 5;
export const MAX_JOURNAL_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
export const JOURNAL_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type JournalImageContentType =
  (typeof JOURNAL_IMAGE_CONTENT_TYPES)[number];
