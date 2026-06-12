import { BankingPage } from "@/components/banking-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserCreditCardAccounts } from "@/lib/credit-card/accounts";
import { getUserDepositoryAccounts } from "@/lib/depository/accounts";

export default async function BankingRoute() {
  const userId = await getCurrentUserId();
  const [accounts, creditCardAccounts] = userId
    ? await Promise.all([
        getUserDepositoryAccounts(userId),
        getUserCreditCardAccounts(userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <BankingPage
        initialAccounts={accounts}
        initialCreditCardAccounts={creditCardAccounts}
      />
    </div>
  );
}
