import { BankingPage } from "@/components/banking-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserDepositoryAccounts } from "@/lib/depository/accounts";

export default async function BankingRoute() {
  const userId = await getCurrentUserId();
  const accounts = userId ? await getUserDepositoryAccounts(userId) : [];

  return (
    <div className="flex flex-col gap-6">
      <BankingPage initialAccounts={accounts} />
    </div>
  );
}
