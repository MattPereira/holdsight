import "server-only";

import { del } from "@vercel/blob";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { blobDeletionJobs } from "@/db/schema/investment-transactions";

const DEFAULT_BATCH_SIZE = 100;
const DELETE_CONCURRENCY = 10;
const LEASE_DURATION_MS = 10 * 60 * 1000;
const INITIAL_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 2_000;

type ClaimedDeletionJob = Pick<
  typeof blobDeletionJobs.$inferSelect,
  "id" | "blobPathname" | "attemptCount"
>;

export type BlobDeletionResult = {
  claimed: number;
  deleted: number;
  failed: number;
};

type DeletionOutcome = {
  job: ClaimedDeletionJob;
  error: string | null;
};

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown Vercel Blob error.";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function retryAt(attemptCount: number): Date {
  const delay = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** Math.min(attemptCount, 12),
    MAX_RETRY_DELAY_MS,
  );
  return new Date(Date.now() + delay);
}

export async function enqueueBlobDeletion(blobPathname: string): Promise<void> {
  await db
    .insert(blobDeletionJobs)
    .values({ blobPathname })
    .onConflictDoNothing({ target: blobDeletionJobs.blobPathname });
}

async function claimDeletionJobs(
  limit: number,
): Promise<{ jobs: ClaimedDeletionJob[]; leaseToken: string }> {
  const now = new Date();
  const available = or(
    isNull(blobDeletionJobs.leaseExpiresAt),
    lte(blobDeletionJobs.leaseExpiresAt, now),
  );
  const candidateRows = await db
    .select({ id: blobDeletionJobs.id })
    .from(blobDeletionJobs)
    .where(and(lte(blobDeletionJobs.nextAttemptAt, now), available))
    .orderBy(asc(blobDeletionJobs.nextAttemptAt), asc(blobDeletionJobs.createdAt))
    .limit(limit);

  const leaseToken = crypto.randomUUID();
  if (candidateRows.length === 0) return { jobs: [], leaseToken };

  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const jobs = await db
    .update(blobDeletionJobs)
    .set({ leaseToken, leaseExpiresAt, updatedAt: now })
    .where(
      and(
        inArray(
          blobDeletionJobs.id,
          candidateRows.map(({ id }) => id),
        ),
        lte(blobDeletionJobs.nextAttemptAt, now),
        available,
      ),
    )
    .returning({
      id: blobDeletionJobs.id,
      blobPathname: blobDeletionJobs.blobPathname,
      attemptCount: blobDeletionJobs.attemptCount,
    });

  return { jobs, leaseToken };
}

async function deleteClaimedJobs(
  jobs: ClaimedDeletionJob[],
): Promise<DeletionOutcome[]> {
  const outcomes = new Array<DeletionOutcome>(jobs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < jobs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const job = jobs[index];

      try {
        await del(job.blobPathname);
        outcomes[index] = { job, error: null };
      } catch (error) {
        outcomes[index] = { job, error: errorMessage(error) };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(DELETE_CONCURRENCY, jobs.length) },
      worker,
    ),
  );

  return outcomes;
}

export async function processBlobDeletionJobs(
  limit = DEFAULT_BATCH_SIZE,
): Promise<BlobDeletionResult> {
  const { jobs, leaseToken } = await claimDeletionJobs(limit);
  if (jobs.length === 0) return { claimed: 0, deleted: 0, failed: 0 };

  const outcomes = await deleteClaimedJobs(jobs);
  const deletedIds = outcomes
    .filter(({ error }) => error === null)
    .map(({ job }) => job.id);
  const failures = outcomes.filter(
    (outcome): outcome is DeletionOutcome & { error: string } =>
      outcome.error !== null,
  );

  if (deletedIds.length > 0) {
    await db
      .delete(blobDeletionJobs)
      .where(
        and(
          inArray(blobDeletionJobs.id, deletedIds),
          eq(blobDeletionJobs.leaseToken, leaseToken),
        ),
      );
  }

  await Promise.all(
    failures.map(({ job, error }) =>
      db
        .update(blobDeletionJobs)
        .set({
          attemptCount: job.attemptCount + 1,
          nextAttemptAt: retryAt(job.attemptCount),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: error,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blobDeletionJobs.id, job.id),
            eq(blobDeletionJobs.leaseToken, leaseToken),
          ),
        ),
    ),
  );

  return {
    claimed: jobs.length,
    deleted: deletedIds.length,
    failed: failures.length,
  };
}
