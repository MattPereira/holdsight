import { z } from "zod";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getUserInvestmentTransactionJournalImages,
  MAX_JOURNAL_IMAGE_COUNT,
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
  uploadUserInvestmentTransactionJournalImage,
  type JournalImageUploadError,
} from "@/lib/investment-transactions/journal-images";

const transactionIdSchema = z.string().uuid();
const MAX_MULTIPART_BODY_BYTES = MAX_JOURNAL_IMAGE_SIZE_BYTES + 64 * 1024;

function uploadErrorResponse(error: JournalImageUploadError): Response {
  switch (error) {
    case "invalid_file":
      return Response.json({ error: "Select an image to upload." }, { status: 400 });
    case "invalid_image_type":
      return Response.json(
        { error: "Upload a PNG, JPEG, or WebP image." },
        { status: 415 },
      );
    case "image_too_large":
      return Response.json(
        { error: "Images must be 4 MiB or smaller." },
        { status: 413 },
      );
    case "image_limit_reached":
      return Response.json(
        { error: `A journal entry can have up to ${MAX_JOURNAL_IMAGE_COUNT} images.` },
        { status: 409 },
      );
    case "transaction_not_found":
      return Response.json({ error: "Transaction not found." }, { status: 404 });
    case "upload_failed":
      return Response.json(
        { error: "The image could not be uploaded." },
        { status: 502 },
      );
  }
}

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

  return Response.json({ image: result.image }, { status: 201 });
}
