import "server-only";

import { and, count, eq, max, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentJournalEntries,
  investmentJournalEntryImages,
  userPreferences,
} from "@/db/schema/investment-journal";
import { enqueueBlobDeletion } from "@/lib/blob/deletion-jobs";
import {
  MAX_JOURNAL_IMAGE_COUNT,
  rollbackJournalImageUpload,
  uploadJournalImageBlob,
  validateJournalImage,
  type JournalImageContentType,
  type JournalImageUploadError,
} from "@/lib/journal-images/upload";
import type { JournalPeriodType } from "@/lib/investment-journal/periods";

export type InvestmentJournalImage = {
  id: string;
  blobUrl: string;
  originalFilename: string;
  contentType: JournalImageContentType;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
};

type JournalPeriodIdentity = {
  periodType: JournalPeriodType;
  periodStart: string;
};

export type InvestmentJournalImageUploadResult =
  | {
      image: InvestmentJournalImage;
      entryId: string;
      entryUpdatedAt: string;
      error: null;
    }
  | { image: null; error: JournalImageUploadError };

function serializeImage(
  image: typeof investmentJournalEntryImages.$inferSelect,
): InvestmentJournalImage {
  return {
    id: image.id,
    blobUrl: image.blobUrl,
    originalFilename: image.originalFilename,
    contentType: image.contentType as JournalImageContentType,
    sizeBytes: image.sizeBytes,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt.toISOString(),
  };
}

function periodConditions(userId: string, period: JournalPeriodIdentity) {
  return and(
    eq(investmentJournalEntries.userId, userId),
    eq(investmentJournalEntries.periodType, period.periodType),
    eq(investmentJournalEntries.periodStart, period.periodStart),
  );
}

export async function getUserInvestmentJournalImages(
  userId: string,
  period: JournalPeriodIdentity,
): Promise<InvestmentJournalImage[]> {
  const rows = await db
    .select({ image: investmentJournalEntryImages })
    .from(investmentJournalEntryImages)
    .innerJoin(
      investmentJournalEntries,
      eq(
        investmentJournalEntries.id,
        investmentJournalEntryImages.journalEntryId,
      ),
    )
    .where(
      and(
        periodConditions(userId, period),
        eq(investmentJournalEntryImages.userId, userId),
      ),
    )
    .orderBy(
      investmentJournalEntryImages.sortOrder,
      investmentJournalEntryImages.createdAt,
    );

  return rows.map(({ image }) => serializeImage(image));
}

async function uploadAvailability(
  userId: string,
  period: JournalPeriodIdentity,
): Promise<"available" | "entry_not_found" | "image_limit_reached"> {
  const [preferences, imageState] = await Promise.all([
    db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
      columns: { userId: true },
    }),
    db
      .select({ imageCount: count() })
      .from(investmentJournalEntryImages)
      .innerJoin(
        investmentJournalEntries,
        eq(
          investmentJournalEntries.id,
          investmentJournalEntryImages.journalEntryId,
        ),
      )
      .where(
        and(
          periodConditions(userId, period),
          eq(investmentJournalEntryImages.userId, userId),
        ),
      ),
  ]);
  if (!preferences) return "entry_not_found";
  if ((imageState[0]?.imageCount ?? 0) >= MAX_JOURNAL_IMAGE_COUNT) {
    return "image_limit_reached";
  }
  return "available";
}

async function persistUploadedImage(input: {
  userId: string;
  period: JournalPeriodIdentity;
  blobPathname: string;
  blobUrl: string;
  originalFilename: string;
  contentType: JournalImageContentType;
  sizeBytes: number;
}): Promise<InvestmentJournalImageUploadResult> {
  return db.transaction(async (tx) => {
    const preferences = await tx.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, input.userId),
      columns: { userId: true },
    });
    if (!preferences) return { image: null, error: "entry_not_found" };

    await tx
      .insert(investmentJournalEntries)
      .values({
        userId: input.userId,
        periodType: input.period.periodType,
        periodStart: input.period.periodStart,
      })
      .onConflictDoNothing({
        target: [
          investmentJournalEntries.userId,
          investmentJournalEntries.periodType,
          investmentJournalEntries.periodStart,
        ],
      });

    const [entry] = await tx
      .select({ id: investmentJournalEntries.id })
      .from(investmentJournalEntries)
      .where(periodConditions(input.userId, input.period))
      .limit(1);
    if (!entry) return { image: null, error: "entry_not_found" };

    await tx.execute(
      sql`select ${investmentJournalEntries.id} from ${investmentJournalEntries} where ${investmentJournalEntries.id} = ${entry.id} for update`,
    );

    const [state] = await tx
      .select({
        imageCount: count(),
        maxSortOrder: max(investmentJournalEntryImages.sortOrder),
      })
      .from(investmentJournalEntryImages)
      .where(eq(investmentJournalEntryImages.journalEntryId, entry.id));
    if ((state?.imageCount ?? 0) >= MAX_JOURNAL_IMAGE_COUNT) {
      return { image: null, error: "image_limit_reached" };
    }

    const [image] = await tx
      .insert(investmentJournalEntryImages)
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
    if (!image) throw new Error("Failed to persist Investment Journal image.");

    const now = new Date();
    const [updatedEntry] = await tx
      .update(investmentJournalEntries)
      .set({ updatedAt: now })
      .where(
        and(
          eq(investmentJournalEntries.id, entry.id),
          eq(investmentJournalEntries.userId, input.userId),
        ),
      )
      .returning({ updatedAt: investmentJournalEntries.updatedAt });

    return {
      image: serializeImage(image),
      entryId: entry.id,
      entryUpdatedAt: (updatedEntry?.updatedAt ?? now).toISOString(),
      error: null,
    };
  });
}

export async function uploadUserInvestmentJournalImage(
  userId: string,
  period: JournalPeriodIdentity,
  file: File,
): Promise<InvestmentJournalImageUploadResult> {
  const validation = await validateJournalImage(file);
  if ("error" in validation) return { image: null, error: validation.error };

  const availability = await uploadAvailability(userId, period);
  if (availability !== "available") {
    return { image: null, error: availability };
  }

  const pathname = `investment-journals/${userId}/${period.periodType}/${period.periodStart}/${crypto.randomUUID()}.${validation.extension}`;
  const blob = await uploadJournalImageBlob(
    pathname,
    file,
    validation.contentType,
  );
  if (!blob) return { image: null, error: "upload_failed" };

  try {
    const result = await persistUploadedImage({
      userId,
      period,
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      originalFilename: validation.originalFilename,
      contentType: validation.contentType,
      sizeBytes: file.size,
    });
    if (result.error) await rollbackJournalImageUpload(blob.pathname);
    return result;
  } catch (error) {
    console.error("Failed to persist Investment Journal image", error);
    await rollbackJournalImageUpload(blob.pathname);
    return { image: null, error: "upload_failed" };
  }
}

export async function removeUserInvestmentJournalImage(
  userId: string,
  period: JournalPeriodIdentity,
  imageId: string,
): Promise<{ entryUpdatedAt: string } | null> {
  const [image] = await db
    .select({
      id: investmentJournalEntryImages.id,
      journalEntryId: investmentJournalEntryImages.journalEntryId,
      blobPathname: investmentJournalEntryImages.blobPathname,
    })
    .from(investmentJournalEntryImages)
    .innerJoin(
      investmentJournalEntries,
      eq(
        investmentJournalEntries.id,
        investmentJournalEntryImages.journalEntryId,
      ),
    )
    .where(
      and(
        periodConditions(userId, period),
        eq(investmentJournalEntryImages.id, imageId),
        eq(investmentJournalEntryImages.userId, userId),
      ),
    )
    .limit(1);
  if (!image) return null;

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(investmentJournalEntryImages)
      .where(
        and(
          eq(investmentJournalEntryImages.id, image.id),
          eq(investmentJournalEntryImages.userId, userId),
          eq(investmentJournalEntryImages.journalEntryId, image.journalEntryId),
        ),
      )
      .returning({ id: investmentJournalEntryImages.id });
    if (deleted.length === 0) return null;

    const [entry] = await tx
      .update(investmentJournalEntries)
      .set({ updatedAt: now })
      .where(
        and(
          eq(investmentJournalEntries.id, image.journalEntryId),
          eq(investmentJournalEntries.userId, userId),
        ),
      )
      .returning({ updatedAt: investmentJournalEntries.updatedAt });
    return { entryUpdatedAt: (entry?.updatedAt ?? now).toISOString() };
  });
  if (!result) return null;

  try {
    await enqueueBlobDeletion(image.blobPathname);
  } catch (error) {
    console.error("Failed to enqueue Investment Journal image cleanup", error);
  }
  return result;
}
