import { CheckingPage } from "@/components/checking-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserDepositoryAccounts } from "@/lib/depository/accounts";

export default async function CheckingRoute() {
  const userId = await getCurrentUserId();
  const accounts = userId ? await getUserDepositoryAccounts(userId) : [];

  return (
    <div className="flex flex-col gap-6">
      <CheckingPage initialAccounts={accounts} />
    </div>
  );
}
