import { type NextRequest, NextResponse } from "next/server";
import { getWalletPositions } from "@/lib/positions";
import type { PositionsResult } from "@/lib/types";

function statusForResult(result: PositionsResult): number {
  switch (result.status) {
    case "ready":
      return 200;
    case "indexing":
      return 202;
    case "rate_limited":
      return 429;
    case "error":
      return result.httpStatus;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const { searchParams } = request.nextUrl;

  try {
    const result = await getWalletPositions(address, {
      currency: searchParams.get("currency") ?? undefined,
      // Pass ?chains=ethereum,base to narrow; omit for all chains.
      chains: searchParams.get("chains") ?? undefined,
    });

    return NextResponse.json(result, { status: statusForResult(result) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { status: "error", error: message },
      { status: 502 },
    );
  }
}
