import { z } from "zod";

import { getCurrentUserId } from "@/lib/auth/session";
import { removeUserInvestmentTransactionJournalImage } from "@/lib/investment-transactions/journal-images";

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ transactionId: string; imageId: string }>;
  },
): Promise<Response> {
  const [userId, routeParams] = await Promise.all([
    getCurrentUserId(),
    params,
  ]);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactionId = idSchema.safeParse(routeParams.transactionId);
  const imageId = idSchema.safeParse(routeParams.imageId);
  if (!transactionId.success || !imageId.success) {
    return Response.json({ error: "Invalid image ID." }, { status: 400 });
  }

  const result = await removeUserInvestmentTransactionJournalImage(
    userId,
    transactionId.data,
    imageId.data,
  );
  if (!result.deleted) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }

  return Response.json({ entryUpdatedAt: result.entryUpdatedAt });
}
