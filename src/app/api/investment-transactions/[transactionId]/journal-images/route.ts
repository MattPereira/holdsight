import { z } from "zod";

import {
  authorizeViewedAccount,
  type ViewedAccountAuthorization,
} from "@/lib/auth/authorize";
import { deniedResponse } from "@/lib/auth/denied-response";
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
  action: "read" | "write",
  params: Promise<{ transactionId: string }>,
): Promise<{
  authorization: ViewedAccountAuthorization;
  transactionId: string | null;
}> {
  const [authorization, routeParams] = await Promise.all([
    authorizeViewedAccount(action),
    params,
  ]);
  const parsedTransactionId = transactionIdSchema.safeParse(
    routeParams.transactionId,
  );

  return {
    authorization,
    transactionId: parsedTransactionId.success
      ? parsedTransactionId.data
      : null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
): Promise<Response> {
  const { authorization, transactionId } = await requestContext("read", params);
  if (authorization.status !== "authorized") {
    return deniedResponse(authorization);
  }
  if (!transactionId) {
    return Response.json({ error: "Invalid transaction ID." }, { status: 400 });
  }

  const images = await getUserInvestmentTransactionJournalImages(
    authorization.userId,
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
  const { authorization, transactionId } = await requestContext(
    "write",
    params,
  );
  if (authorization.status !== "authorized") {
    return deniedResponse(authorization);
  }
  if (!transactionId) {
    return Response.json({ error: "Invalid transaction ID." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_MULTIPART_BODY_BYTES
  ) {
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
    authorization.userId,
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
