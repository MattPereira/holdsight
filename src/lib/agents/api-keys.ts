import "server-only";

import { createHash, randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { agentApiKeys } from "@/db/schema/agent-api-keys";

export const AGENT_KEY_PREFIX = "hsk_live_";
export const AGENT_SCOPE_PORTFOLIO_ALLOCATIONS = "portfolio:allocations";

const DEFAULT_AGENT_SCOPES = [AGENT_SCOPE_PORTFOLIO_ALLOCATIONS];
const KEY_PREFIX_DISPLAY_LENGTH = 18;
const MAX_KEY_NAME_LENGTH = 80;

export type AgentApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type CreatedAgentApiKey = {
  key: AgentApiKey;
  secret: string;
};

export type AuthenticatedAgentApiKey = {
  id: string;
  userId: string;
  scopes: string[];
};

function hashAgentApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateAgentApiKeySecret(): string {
  return `${AGENT_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

function normalizeName(name: string): string {
  return name.trim().slice(0, MAX_KEY_NAME_LENGTH);
}

function rowToAgentApiKey(row: typeof agentApiKeys.$inferSelect): AgentApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

export async function getUserAgentApiKeys(
  userId: string,
): Promise<AgentApiKey[]> {
  const rows = await db
    .select()
    .from(agentApiKeys)
    .where(and(eq(agentApiKeys.userId, userId), isNull(agentApiKeys.revokedAt)))
    .orderBy(desc(agentApiKeys.createdAt));

  return rows.map(rowToAgentApiKey);
}

export async function createUserAgentApiKey(
  userId: string,
  input: { name: string },
): Promise<{ result?: CreatedAgentApiKey; error: string | null }> {
  const name = normalizeName(input.name);
  if (!name) return { error: "Enter a key name." };

  const secret = generateAgentApiKeySecret();
  const [row] = await db
    .insert(agentApiKeys)
    .values({
      userId,
      name,
      keyHash: hashAgentApiKey(secret),
      keyPrefix: secret.slice(0, KEY_PREFIX_DISPLAY_LENGTH),
      scopes: DEFAULT_AGENT_SCOPES,
    })
    .returning();

  return {
    result: {
      key: rowToAgentApiKey(row),
      secret,
    },
    error: null,
  };
}

export async function revokeUserAgentApiKey(
  userId: string,
  keyId: string,
): Promise<void> {
  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(agentApiKeys.id, keyId),
        eq(agentApiKeys.userId, userId),
        isNull(agentApiKeys.revokedAt),
      ),
    );
}

export async function authenticateAgentApiKey(
  secret: string,
): Promise<AuthenticatedAgentApiKey | null> {
  if (!secret.startsWith(AGENT_KEY_PREFIX)) return null;

  const [row] = await db
    .select({
      id: agentApiKeys.id,
      userId: agentApiKeys.userId,
      scopes: agentApiKeys.scopes,
    })
    .from(agentApiKeys)
    .where(
      and(
        eq(agentApiKeys.keyHash, hashAgentApiKey(secret)),
        isNull(agentApiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, row.id));

  return row;
}

export function hasAgentScope(
  key: AuthenticatedAgentApiKey,
  scope: string,
): boolean {
  return key.scopes.includes(scope);
}
