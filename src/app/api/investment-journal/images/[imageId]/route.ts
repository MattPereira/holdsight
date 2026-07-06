import { z } from "zod";

import { getCurrentUserId } from "@/lib/auth/session";
import { removeUserInvestmentJournalImage } from "@/lib/investment-journal/images";
import {
  parseCanonicalJournalPeriod,
} from "@/lib/investment-journal/periods";

const idSchema = z.string().uuid();

function requestedPeriod(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return parseCanonicalJournalPeriod(
    searchParams.get("type") ?? "",
    searchParams.get("date") ?? "",
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ imageId: string }> },
): Promise<Response> {
  const [userId, routeParams] = await Promise.all([getCurrentUserId(), params]);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const imageId = idSchema.safeParse(routeParams.imageId);
  const period = requestedPeriod(request);
  if (!imageId.success || !period) {
    return Response.json({ error: "Invalid image request." }, { status: 400 });
  }

  const result = await removeUserInvestmentJournalImage(
    userId,
    period,
    imageId.data,
  );
  if (!result) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }
  return Response.json(result);
}
