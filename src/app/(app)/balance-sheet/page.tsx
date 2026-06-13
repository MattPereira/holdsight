import { BankingPage } from "@/components/banking-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { aggregateAssetRows } from "@/lib/balance-sheet/aggregate-assets";
import { getCurrentBrokerageBalances } from "@/lib/brokerage/balances";
import { getUserCreditCardAccounts } from "@/lib/credit-card/accounts";
import { getUserDepositoryAccounts } from "@/lib/depository/accounts";
import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import { getCurrentKrakenBalances } from "@/lib/exchange/kraken/balances";
import { getUserManualBalanceItems } from "@/lib/manual-balance/items";
import { getCurrentOnChainBalances } from "@/lib/on-chain/balances";

export default async function BankingRoute() {
  const userId = await getCurrentUserId();
  const [
    accounts,
    creditCardAccounts,
    manualItems,
    onChainResults,
    exchangeResults,
    brokerageAccounts,
  ] = userId
    ? await Promise.all([
        getUserDepositoryAccounts(userId),
        getUserCreditCardAccounts(userId),
        getUserManualBalanceItems(userId),
        getCurrentOnChainBalances(userId),
        getUserKrakenAccounts(userId).then(getCurrentKrakenBalances),
        getCurrentBrokerageBalances(userId),
      ])
    : [[], [], [], [], [], []];

  return (
    <div className="flex flex-col gap-6">
      <BankingPage
        initialAccounts={accounts}
        initialCreditCardAccounts={creditCardAccounts}
        initialManualItems={manualItems}
        initialAggregateAssetRows={aggregateAssetRows({
          onChainResults,
          exchangeResults,
          brokerageAccounts,
        })}
      />
    </div>
  );
}
