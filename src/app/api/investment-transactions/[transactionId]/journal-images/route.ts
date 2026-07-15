import { z } from "zod";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getUserInvestmentTransactionJournalImages,
  MAX_JOURNAL_IMAGE_COUNT,
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
  uploadUserInvestmentTransactionJournalImage,
} from "@/lib/journal/transaction-entry-images";
import { journalImageUploadErrorResponse } from "@/lib/journal/images/responses";

const transactionIdSchema = z.string().uuid();
const MAX_MULTIPART_BODY_BYTES = MAX_JOURNAL_IMAGE_SIZE_BYTES + 64 * 1024;

const uploadErrorResponse = (
  error: Parameters<typeof journalImageUploadErrorResponse>[0],
) =>
  journalImageUploadErrorResponse(error, {
    limitOwner: "A Trade Journal Entry",
    notFoundMessage: "Transaction not found.",
  });

async function requestContext(
  params: Promise<{ transactionId: string }>,
): Promise<{ userId: string | null; transactionId: string | null }> {
  const [userId, routeParams] = await Promise.all([
    getCurrentUserId(),
    params,
  ]);
  const parsedTransactionId = transactionIdSchema.safeParse(
    routeParams.transactionId,
  );

  return {
    userId,
    transactionId: parsedTransactionId.success
      ? parsedTransactionId.data
      : null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
): Promise<Response> {
  const { userId, transactionId } = await requestContext(params);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!transactionId) {
    return Response.json({ error: "Invalid transaction ID." }, { status: 400 });
  }

  const images = await getUserInvestmentTransactionJournalImages(
    userId,
    transactionId,
  );
  if (!images) {
    return Response.json({ error: "Transaction not found." }, { status: 404 });
  }

  return Response.json({
    images,
    limits: {
      count: MAX_JOURNAL_IMAGE_COUNT,
      sizeBytes: MAX_JOURNAL_IMAGE_SIZE_BYTES,
      contentTypes: ["image/png", "image/jpeg", "image/webp"],
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
): Promise<Response> {
  const { userId, transactionId } = await requestContext(params);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!transactionId) {
    return Response.json({ error: "Invalid transaction ID." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
    return uploadErrorResponse("image_too_large");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return uploadErrorResponse("invalid_file");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return uploadErrorResponse("invalid_file");

  const result = await uploadUserInvestmentTransactionJournalImage(
    userId,
    transactionId,
    file,
  );
  if (result.error) return uploadErrorResponse(result.error);

  return Response.json(
    {
      image: result.image,
      entryId: result.entryId,
      entryUpdatedAt: result.entryUpdatedAt,
    },
    { status: 201 },
  );
}
