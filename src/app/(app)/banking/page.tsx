import { BankingPage } from "@/components/banking-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserCreditCardAccounts } from "@/lib/credit-card/accounts";
import { getUserDepositoryAccounts } from "@/lib/depository/accounts";
import { getUserManualBalanceItems } from "@/lib/manual-balance/items";

export default async function BankingRoute() {
  const userId = await getCurrentUserId();
  const [accounts, creditCardAccounts, manualItems] = userId
    ? await Promise.all([
        getUserDepositoryAccounts(userId),
        getUserCreditCardAccounts(userId),
        getUserManualBalanceItems(userId),
      ])
    : [[], [], []];

  return (
    <div className="flex flex-col gap-6">
      <BankingPage
        initialAccounts={accounts}
        initialCreditCardAccounts={creditCardAccounts}
        initialManualItems={manualItems}
      />
    </div>
  );
}
