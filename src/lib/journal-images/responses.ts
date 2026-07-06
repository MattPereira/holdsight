import {
  MAX_JOURNAL_IMAGE_COUNT,
  type JournalImageUploadError,
} from "@/lib/journal-images/upload";

type UploadError = JournalImageUploadError | "transaction_not_found";

export function journalImageUploadErrorResponse(
  error: UploadError,
  options: {
    limitOwner: string;
    notFoundMessage: string;
    notFoundStatus?: number;
  },
): Response {
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
        {
          error: `${options.limitOwner} can have up to ${MAX_JOURNAL_IMAGE_COUNT} images.`,
        },
        { status: 409 },
      );
    case "entry_not_found":
    case "transaction_not_found":
      return Response.json(
        { error: options.notFoundMessage },
        { status: options.notFoundStatus ?? 404 },
      );
    case "upload_failed":
      return Response.json(
        { error: "The image could not be uploaded." },
        { status: 502 },
      );
  }
}
