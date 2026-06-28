"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/auth/session";
import type { AssetGroup } from "@/lib/portfolio/asset-totals";
import {
  createAssetGroup,
  getUserAssetGroups,
  removeAssetGroup,
  updateAssetGroup,
} from "@/lib/portfolio/groups";

export type AssetGroupActionResult = {
  groups: AssetGroup[];
  error: string | null;
};

async function unauthorizedGroupResult(): Promise<AssetGroupActionResult> {
  return {
    groups: [],
    error: "You must be signed in to manage groups.",
  };
}

function revalidateGroupPaths(): void {
  revalidatePath("/");
  revalidatePath("/theses");
  revalidatePath("/wallets");
  revalidatePath("/exchange");
  revalidatePath("/brokerages");
}

export async function createGroup(input: {
  name?: string | null;
  color?: string | null;
  thesis?: string | null;
  targetAllocationPercent?: number | null;
  symbols: string[];
}): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  const result = await createAssetGroup(userId, input);
  const groups = await getUserAssetGroups(userId);
  if (result.error) return { groups, error: result.error };

  revalidateGroupPaths();
  return { groups, error: null };
}

export async function updateGroup(
  groupId: string,
  input: {
    name?: string | null;
    color?: string | null;
    thesis?: string | null;
    targetAllocationPercent?: number | null;
    symbols: string[];
  },
): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  const result = await updateAssetGroup(userId, groupId, input);
  const groups = await getUserAssetGroups(userId);
  if (result.error) return { groups, error: result.error };

  revalidateGroupPaths();
  return { groups, error: null };
}

export async function deleteGroup(
  groupId: string,
): Promise<AssetGroupActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedGroupResult();

  await removeAssetGroup(userId, groupId);
  const groups = await getUserAssetGroups(userId);

  revalidateGroupPaths();
  return { groups, error: null };
}
