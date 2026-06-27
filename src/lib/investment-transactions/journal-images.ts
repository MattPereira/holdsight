import "server-only";

import { del, put } from "@vercel/blob";
import { and, count, eq, max, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentTransactionJournalEntries,
  investmentTransactionJournalEntryImages,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import { enqueueBlobDeletion } from "@/lib/blob/deletion-jobs";

export const MAX_JOURNAL_IMAGE_COUNT = 5;
export const MAX_JOURNAL_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type JournalImageContentType = keyof typeof IMAGE_TYPES;

export type InvestmentTransactionJournalImage = {
  id: string;
  transactionId: string;
  blobUrl: string;
  originalFilename: string;
  contentType: JournalImageContentType;
  sizeBytes: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type JournalImageUploadError =
  | "invalid_file"
  | "invalid_image_type"
  | "image_too_large"
  | "image_limit_reached"
  | "transaction_not_found"
  | "upload_failed";

export type JournalImageUploadResult =
  | { image: InvestmentTransactionJournalImage; error: null }
  | { image: null; error: JournalImageUploadError };

function toJournalImage(
  row: typeof investmentTransactionJournalEntryImages.$inferSelect,
  transactionId: string,
): InvestmentTransactionJournalImage {
  return {
    id: row.id,
    transactionId,
    blobUrl: row.blobUrl,
    originalFilename: row.originalFilename,
    contentType: row.contentType as JournalImageContentType,
    sizeBytes: row.sizeBytes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function userOwnsTransaction(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const [transaction] = await db
    .select({ id: investmentTransactions.id })
    .from(investmentTransactions)
    .where(
      and(
        eq(investmentTransactions.id, transactionId),
        eq(investmentTransactions.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(transaction);
}

async function imageCount(userId: string, transactionId: string): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(investmentTransactionJournalEntryImages)
    .innerJoin(
      investmentTransactionJournalEntries,
      eq(
        investmentTransactionJournalEntries.id,
        investmentTransactionJournalEntryImages.journalEntryId,
      ),
    )
    .where(
      and(
        eq(investmentTransactionJournalEntryImages.userId, userId),
        eq(
          investmentTransactionJournalEntries.transactionId,
          transactionId,
        ),
      ),
    );

  return result?.value ?? 0;
}

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

async function validateFile(
  file: File,
): Promise<
  | { contentType: JournalImageContentType; extension: string }
  | { error: JournalImageUploadError }
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

  return { contentType, extension: IMAGE_TYPES[contentType] };
}

function originalFilename(file: File, extension: string): string {
  const normalized = file.name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return normalized || `chart.${extension}`;
}

async function persistUploadedImage(input: {
  userId: string;
  transactionId: string;
  blobPathname: string;
  blobUrl: string;
  originalFilename: string;
  contentType: JournalImageContentType;
  sizeBytes: number;
}): Promise<
  | { image: InvestmentTransactionJournalImage; error: null }
  | {
      image: null;
      error: "image_limit_reached" | "transaction_not_found";
    }
> {
  return db.transaction(async (tx) => {
    await tx
      .insert(investmentTransactionJournalEntries)
      .values({ userId: input.userId, transactionId: input.transactionId })
      .onConflictDoNothing({
        target: investmentTransactionJournalEntries.transactionId,
      });

    const [entry] = await tx
      .select({ id: investmentTransactionJournalEntries.id })
      .from(investmentTransactionJournalEntries)
      .where(
        and(
          eq(investmentTransactionJournalEntries.userId, input.userId),
          eq(
            investmentTransactionJournalEntries.transactionId,
            input.transactionId,
          ),
        ),
      )
      .limit(1);

    if (!entry) return { image: null, error: "transaction_not_found" };

    await tx.execute(
      sql`select ${investmentTransactionJournalEntries.id} from ${investmentTransactionJournalEntries} where ${investmentTransactionJournalEntries.id} = ${entry.id} for update`,
    );

    const [state] = await tx
      .select({
        imageCount: count(),
        maxSortOrder: max(investmentTransactionJournalEntryImages.sortOrder),
      })
      .from(investmentTransactionJournalEntryImages)
      .where(
        eq(investmentTransactionJournalEntryImages.journalEntryId, entry.id),
      );

    if ((state?.imageCount ?? 0) >= MAX_JOURNAL_IMAGE_COUNT) {
      return { image: null, error: "image_limit_reached" };
    }

    const [image] = await tx
      .insert(investmentTransactionJournalEntryImages)
      .values({
        userId: input.userId,
        journalEntryId: entry.id,
        blobPathname: input.blobPathname,
        blobUrl: input.blobUrl,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sortOrder: (state?.maxSortOrder ?? -1) + 1,
      })
      .returning();

    if (!image) throw new Error("Failed to persist uploaded journal image.");
    return { image: toJournalImage(image, input.transactionId), error: null };
  });
}

async function rollbackUpload(blobPathname: string): Promise<void> {
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

export async function uploadUserInvestmentTransactionJournalImage(
  userId: string,
  transactionId: string,
  file: File,
): Promise<JournalImageUploadResult> {
  const validation = await validateFile(file);
  if ("error" in validation) return { image: null, error: validation.error };

  const [ownsTransaction, currentImageCount] = await Promise.all([
    userOwnsTransaction(userId, transactionId),
    imageCount(userId, transactionId),
  ]);
  if (!ownsTransaction) return { image: null, error: "transaction_not_found" };
  if (currentImageCount >= MAX_JOURNAL_IMAGE_COUNT) {
    return { image: null, error: "image_limit_reached" };
  }

  const pathname = `trade-journals/${userId}/${transactionId}/${crypto.randomUUID()}.${validation.extension}`;
  let blob: Awaited<ReturnType<typeof put>>;

  try {
    blob = await put(pathname, file, {
      access: "public",
      contentType: validation.contentType,
    });
  } catch (uploadError) {
    console.error("Failed to upload trade journal image", uploadError);
    return { image: null, error: "upload_failed" };
  }

  try {
    const result = await persistUploadedImage({
      userId,
      transactionId,
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      originalFilename: originalFilename(file, validation.extension),
      contentType: validation.contentType,
      sizeBytes: file.size,
    });

    if (result.error) await rollbackUpload(blob.pathname);
    return result;
  } catch (persistError) {
    console.error("Failed to persist trade journal image", persistError);
    await rollbackUpload(blob.pathname);
    return { image: null, error: "upload_failed" };
  }
}

export async function getUserInvestmentTransactionJournalImages(
  userId: string,
  transactionId: string,
): Promise<InvestmentTransactionJournalImage[] | null> {
  if (!(await userOwnsTransaction(userId, transactionId))) return null;

  const rows = await db
    .select({ image: investmentTransactionJournalEntryImages })
    .from(investmentTransactionJournalEntryImages)
    .innerJoin(
      investmentTransactionJournalEntries,
      eq(
        investmentTransactionJournalEntries.id,
        investmentTransactionJournalEntryImages.journalEntryId,
      ),
    )
    .where(
      and(
        eq(investmentTransactionJournalEntryImages.userId, userId),
        eq(
          investmentTransactionJournalEntries.transactionId,
          transactionId,
        ),
      ),
    )
    .orderBy(
      investmentTransactionJournalEntryImages.sortOrder,
      investmentTransactionJournalEntryImages.createdAt,
    );

  return rows.map(({ image }) => toJournalImage(image, transactionId));
}

export async function removeUserInvestmentTransactionJournalImage(
  userId: string,
  transactionId: string,
  imageId: string,
): Promise<boolean> {
  const [image] = await db
    .select({
      id: investmentTransactionJournalEntryImages.id,
      journalEntryId: investmentTransactionJournalEntryImages.journalEntryId,
      blobPathname: investmentTransactionJournalEntryImages.blobPathname,
    })
    .from(investmentTransactionJournalEntryImages)
    .innerJoin(
      investmentTransactionJournalEntries,
      eq(
        investmentTransactionJournalEntries.id,
        investmentTransactionJournalEntryImages.journalEntryId,
      ),
    )
    .where(
      and(
        eq(investmentTransactionJournalEntryImages.id, imageId),
        eq(investmentTransactionJournalEntryImages.userId, userId),
        eq(
          investmentTransactionJournalEntries.transactionId,
          transactionId,
        ),
      ),
    )
    .limit(1);

  if (!image) return false;

  const deleted = await db
    .delete(investmentTransactionJournalEntryImages)
    .where(
      and(
        eq(investmentTransactionJournalEntryImages.id, image.id),
        eq(investmentTransactionJournalEntryImages.userId, userId),
        eq(
          investmentTransactionJournalEntryImages.journalEntryId,
          image.journalEntryId,
        ),
      ),
    )
    .returning({ id: investmentTransactionJournalEntryImages.id });

  if (deleted.length === 0) return false;

  // The row is gone; hand the Blob off to the deletion queue so the cron can
  // reclaim it. Enqueue failures must not fail the user's delete, so swallow.
  try {
    await enqueueBlobDeletion(image.blobPathname);
  } catch (enqueueError) {
    console.error("Failed to enqueue journal image Blob cleanup", enqueueError);
  }

  return true;
}
