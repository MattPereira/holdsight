import { processBlobDeletionJobs } from "@/lib/blob/deletion-jobs";

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processBlobDeletionJobs();
  return Response.json(result, { status: result.failed > 0 ? 503 : 200 });
}
