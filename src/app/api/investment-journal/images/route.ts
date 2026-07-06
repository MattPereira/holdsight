import { getCurrentUserId } from "@/lib/auth/session";
import {
  getUserInvestmentJournalImages,
  uploadUserInvestmentJournalImage,
} from "@/lib/investment-journal/images";
import {
  parseCanonicalJournalPeriod,
} from "@/lib/investment-journal/periods";
import {
  JOURNAL_IMAGE_CONTENT_TYPES,
  MAX_JOURNAL_IMAGE_COUNT,
  MAX_JOURNAL_IMAGE_SIZE_BYTES,
} from "@/lib/journal-images/upload";
import { journalImageUploadErrorResponse } from "@/lib/journal-images/responses";

const MAX_MULTIPART_BODY_BYTES = MAX_JOURNAL_IMAGE_SIZE_BYTES + 64 * 1024;

function requestedPeriod(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return parseCanonicalJournalPeriod(
    searchParams.get("type") ?? "",
    searchParams.get("date") ?? "",
  );
}

const uploadErrorResponse = (
  error: Parameters<typeof journalImageUploadErrorResponse>[0],
) =>
  journalImageUploadErrorResponse(error, {
    limitOwner: "An Investment Journal Entry",
    notFoundMessage: "Confirm your home timezone before uploading images.",
    notFoundStatus: 409,
  });

export async function GET(request: Request): Promise<Response> {
  const period = requestedPeriod(request);
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!period) {
    return Response.json({ error: "Invalid Journal Period." }, { status: 400 });
  }

  const images = await getUserInvestmentJournalImages(userId, period);
  return Response.json({
    images,
    limits: {
      count: MAX_JOURNAL_IMAGE_COUNT,
      sizeBytes: MAX_JOURNAL_IMAGE_SIZE_BYTES,
      contentTypes: JOURNAL_IMAGE_CONTENT_TYPES,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const period = requestedPeriod(request);
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!period) {
    return Response.json({ error: "Invalid Journal Period." }, { status: 400 });
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

  const result = await uploadUserInvestmentJournalImage(userId, period, file);
  if (result.error) return uploadErrorResponse(result.error);
  return Response.json(result, { status: 201 });
}
