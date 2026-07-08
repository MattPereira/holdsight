import "server-only";

import { saveCreditCardAccounts } from "@/lib/credit-card/accounts";
import { getCreditCardAccounts } from "@/lib/credit-card/client";
import { decrypt } from "@/lib/plaid/crypto";
import { getUserCreditCardPlaidItems } from "@/lib/plaid/items";

/**
 * Refresh credit-card balance, payment, statement, and APR data for every
 * linked credit-card Plaid Item. Items are independent logins, so one failing
 * Item does not stop the rest.
 */
export async function syncUserCreditCardAccounts(userId: string): Promise<void> {
  const items = await getUserCreditCardPlaidItems(userId);

  for (const item of items) {
    const accessToken = decrypt(item.accessTokenEncrypted, userId);
    const result = await getCreditCardAccounts(accessToken);
    if (result.status !== "ready") continue;
    await saveCreditCardAccounts(
      userId,
      item.id,
      item.institutionName,
      result.accounts,
    );
  }
}
