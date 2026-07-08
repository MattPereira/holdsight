import "server-only";

import { and, count, eq, inArray, max, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentTransactionJournalEntries,
  investmentTransactionJournalEntryImages,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import { enqueueBlobDeletion } from "@/lib/blob/deletion-jobs";
import {
  MAX_JOURNAL_IMAGE_COUNT,
  rollbackJournalImageUpload,
  uploadJournalImageBlob,
  validateJournalImage,
  type JournalImageContentType,
  type JournalImageUploadError as SharedJournalImageUploadError,
} from "@/lib/journal/images/upload";

export {
  MAX_JOURNAL_IMAGE_COUNT,
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
} from "@/lib/journal/images/upload";

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
  | Exclude<SharedJournalImageUploadError, "entry_not_found">
  | "transaction_not_found";

export type JournalImageUploadResult =
  | {
      image: InvestmentTransactionJournalImage;
      entryId: string;
      entryUpdatedAt: string;
      error: null;
    }
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

async function persistUploadedImage(input: {
  userId: string;
  transactionId: string;
  blobPathname: string;
  blobUrl: string;
  originalFilename: string;
  contentType: JournalImageContentType;
  sizeBytes: number;
}): Promise<
  | {
      image: InvestmentTransactionJournalImage;
      entryId: string;
      entryUpdatedAt: string;
      error: null;
    }
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
      .select({
        id: investmentTransactionJournalEntries.id,
      })
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
    const now = new Date();
    const [updatedEntry] = await tx
      .update(investmentTransactionJournalEntries)
      .set({ updatedAt: now })
      .where(
        and(
          eq(investmentTransactionJournalEntries.id, entry.id),
          eq(investmentTransactionJournalEntries.userId, input.userId),
        ),
      )
      .returning({
        id: investmentTransactionJournalEntries.id,
        updatedAt: investmentTransactionJournalEntries.updatedAt,
      });
    if (!updatedEntry) {
      throw new Error("Failed to version journal image upload.");
    }
    return {
      image: toJournalImage(image, input.transactionId),
      entryId: updatedEntry.id,
      entryUpdatedAt: updatedEntry.updatedAt.toISOString(),
      error: null,
    };
  });
}

export async function uploadUserInvestmentTransactionJournalImage(
  userId: string,
  transactionId: string,
  file: File,
): Promise<JournalImageUploadResult> {
  const validation = await validateJournalImage(file);
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
  const blob = await uploadJournalImageBlob(
    pathname,
    file,
    validation.contentType,
  );
  if (!blob) return { image: null, error: "upload_failed" };

  try {
    const result = await persistUploadedImage({
      userId,
      transactionId,
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      originalFilename: validation.originalFilename,
      contentType: validation.contentType,
      sizeBytes: file.size,
    });

    if (result.error) await rollbackJournalImageUpload(blob.pathname);
    return result;
  } catch (persistError) {
    console.error("Failed to persist trade journal image", persistError);
    await rollbackJournalImageUpload(blob.pathname);
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

/**
 * Batch variant used by agent-facing transaction pages. Ownership is enforced
 * by the user id on both the journal entry and image rows.
 */
export async function getUserInvestmentTransactionJournalImagesForTransactions(
  userId: string,
  transactionIds: string[],
): Promise<InvestmentTransactionJournalImage[]> {
  if (transactionIds.length === 0) return [];

  const rows = await db
    .select({
      transactionId: investmentTransactionJournalEntries.transactionId,
      image: investmentTransactionJournalEntryImages,
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
        eq(investmentTransactionJournalEntryImages.userId, userId),
        eq(investmentTransactionJournalEntries.userId, userId),
        inArray(
          investmentTransactionJournalEntries.transactionId,
          transactionIds,
        ),
      ),
    )
    .orderBy(
      investmentTransactionJournalEntries.transactionId,
      investmentTransactionJournalEntryImages.sortOrder,
      investmentTransactionJournalEntryImages.createdAt,
    );

  return rows.map(({ transactionId, image }) =>
    toJournalImage(image, transactionId),
  );
}

export async function removeUserInvestmentTransactionJournalImage(
  userId: string,
  transactionId: string,
  imageId: string,
): Promise<{ deleted: boolean; entryUpdatedAt?: string }> {
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

  if (!image) return { deleted: false };

  const mutation = await db.transaction(async (tx) => {
    const deleted = await tx
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
    if (deleted.length === 0) return null;
    const [entry] = await tx
      .update(investmentTransactionJournalEntries)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(investmentTransactionJournalEntries.id, image.journalEntryId),
          eq(investmentTransactionJournalEntries.userId, userId),
        ),
      )
      .returning({ updatedAt: investmentTransactionJournalEntries.updatedAt });
    return entry?.updatedAt.toISOString() ?? null;
  });

  if (!mutation) return { deleted: false };

  // The row is gone; hand the Blob off to the deletion queue so the cron can
  // reclaim it. Enqueue failures must not fail the user's delete, so swallow.
  try {
    await enqueueBlobDeletion(image.blobPathname);
  } catch (enqueueError) {
    console.error("Failed to enqueue journal image Blob cleanup", enqueueError);
  }

  return { deleted: true, entryUpdatedAt: mutation };
}
