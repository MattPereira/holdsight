import { z } from "zod";

import { authorizeViewedAccount } from "@/lib/auth/authorize";
import { deniedResponse } from "@/lib/auth/denied-response";
import { removeUserInvestmentTransactionJournalImage } from "@/lib/journal/transaction-entry-images";

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ transactionId: string; imageId: string }>;
  },
): Promise<Response> {
  const [authorization, routeParams] = await Promise.all([
    authorizeViewedAccount("write"),
    params,
  ]);
  if (authorization.status !== "authorized") {
    return deniedResponse(authorization);
  }

  const transactionId = idSchema.safeParse(routeParams.transactionId);
  const imageId = idSchema.safeParse(routeParams.imageId);
  if (!transactionId.success || !imageId.success) {
    return Response.json({ error: "Invalid image ID." }, { status: 400 });
  }

  const result = await removeUserInvestmentTransactionJournalImage(
    authorization.userId,
    transactionId.data,
    imageId.data,
  );
  if (!result.deleted) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }

  return Response.json({ entryUpdatedAt: result.entryUpdatedAt });
}
