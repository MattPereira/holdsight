import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  AGENT_SCOPE_PORTFOLIO_ALLOCATIONS,
  authenticateAgentApiKey,
  hasAgentScope,
} from "@/lib/agents/api-keys";
import { getUserAssetGroups } from "@/lib/portfolio/groups";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";
import type { PortfolioHomeData } from "@/lib/portfolio/page-data";
import { applyAssetGroups } from "@/lib/portfolio/asset-totals";

const MIN_AGENT_ASSET_VALUE_USD = 10;

function bearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme.toLowerCase() === "bearer" && token ? token : null;
}

async function agentPortfolioResponse(userId: string, data: PortfolioHomeData) {
  const grandTotalValueUsd = data.portfolioSummary.grandTotalValue;
  const groups = await getUserAssetGroups(userId);
  const visibleAssets = data.portfolioSummary.totals.filter(
    (asset) => asset.valueUsd >= MIN_AGENT_ASSET_VALUE_USD,
  );

  return {
    portfolio: {
      grandTotalValueUsd,
      allocations: applyAssetGroups(visibleAssets, groups).map((row) => {
        const weight =
          grandTotalValueUsd === 0 ? 0 : row.valueUsd / grandTotalValueUsd;

        if (!row.isGroup) {
          return {
            type: "asset" as const,
            symbol: row.label,
            name: row.name ?? null,
            amount: row.amount,
            valueUsd: row.valueUsd,
            weight,
          };
        }

        const groupId = row.key.startsWith("group:")
          ? row.key.slice("group:".length)
          : row.key;
        const group = groups.find((candidate) => candidate.id === groupId);

        return {
          type: "group" as const,
          id: groupId,
          name: row.label,
          userDefinedName: group?.name ?? null,
          valueUsd: row.valueUsd,
          weight,
          members: row.members.map((member) => ({
            symbol: member.symbol,
            name: member.name ?? null,
            amount: member.amount,
            valueUsd: member.valueUsd,
            weight:
              grandTotalValueUsd === 0
                ? 0
                : member.valueUsd / grandTotalValueUsd,
          })),
        };
      }),
    },
  };
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const agentKey = token ? await authenticateAgentApiKey(token) : null;
  if (token && !agentKey) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_api_key",
          message: "The agent API key is invalid or has been revoked.",
        },
      },
      { status: 401 },
    );
  }

  if (
    agentKey &&
    !hasAgentScope(agentKey, AGENT_SCOPE_PORTFOLIO_ALLOCATIONS)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_scope",
          message: "This API key cannot refresh portfolio data.",
        },
      },
      { status: 403 },
    );
  }

  const userId = agentKey?.userId ?? (await getCurrentUserId());
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Authentication is required.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const data = await refreshPortfolioForUser(userId);
    return NextResponse.json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      ...(await agentPortfolioResponse(userId, data)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "refresh_failed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to refresh portfolio.",
        },
      },
      { status: 502 },
    );
  }
}
