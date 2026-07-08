import "server-only";

import { getDepositoryAccounts } from "@/lib/plaid/client";
import { decrypt } from "@/lib/plaid/crypto";
import { getUserDepositoryPlaidItems } from "@/lib/plaid/items";
import { saveDepositoryAccounts } from "@/lib/depository/accounts";

/**
 * Refresh cached depository balances for every linked Plaid Item. Uses the free
 * /accounts/get endpoint (no Balance product, no per-call billing). Items are
 * independent logins, so one failing doesn't stop the others.
 */
export async function syncUserDepositoryBalances(userId: string): Promise<void> {
  const items = await getUserDepositoryPlaidItems(userId);

  for (const item of items) {
    const accessToken = decrypt(item.accessTokenEncrypted, userId);
    const result = await getDepositoryAccounts(accessToken);
    if (result.status !== "ready") continue;
    await saveDepositoryAccounts(
      userId,
      item.id,
      item.institutionName,
      result.accounts,
    );
  }
}
