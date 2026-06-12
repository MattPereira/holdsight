import "server-only";

import {
  AccountSubtype,
  AccountType,
  type AccountBase,
  type APR,
  type CreditCardLiability,
} from "plaid";

import { getClient, readPlaidError } from "@/lib/plaid/client";

export type PlaidCreditCardApr = {
  aprPercentage: number;
  aprType: string;
  balanceSubjectToApr: number | null;
  interestChargeAmount: number | null;
};

export type PlaidCreditCardAccount = {
  externalAccountId: string; // Plaid account_id
  name: string;
  mask: string | null;
  currentBalance: number;
  availableCredit: number | null;
  creditLimit: number | null;
  currency: string;
  minimumPaymentAmount: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  lastStatementIssueDate: string | null;
  lastStatementBalance: number | null;
  isOverdue: boolean | null;
  aprs: PlaidCreditCardApr[];
};

export type CreditCardAccountsResult =
  | { status: "ready"; accounts: PlaidCreditCardAccount[] }
  | { status: "login_required" }
  | { status: "error"; message: string; httpStatus: number };

function normalizeApr(apr: APR): PlaidCreditCardApr {
  return {
    aprPercentage: apr.apr_percentage,
    aprType: apr.apr_type,
    balanceSubjectToApr: apr.balance_subject_to_apr,
    interestChargeAmount: apr.interest_charge_amount,
  };
}

function normalizeCreditCard(
  account: AccountBase,
  liability: CreditCardLiability,
): PlaidCreditCardAccount {
  return {
    externalAccountId: account.account_id,
    name: account.name,
    mask: account.mask ?? null,
    currentBalance: account.balances.current ?? 0,
    availableCredit: account.balances.available,
    creditLimit: account.balances.limit,
    currency: account.balances.iso_currency_code ?? "USD",
    minimumPaymentAmount: liability.minimum_payment_amount,
    nextPaymentDueDate: liability.next_payment_due_date,
    lastPaymentAmount: liability.last_payment_amount,
    lastPaymentDate: liability.last_payment_date,
    lastStatementIssueDate: liability.last_statement_issue_date,
    lastStatementBalance: liability.last_statement_balance,
    isOverdue: liability.is_overdue,
    aprs: liability.aprs.map(normalizeApr),
  };
}

function isCreditCardAccount(account: AccountBase): boolean {
  return (
    account.type === AccountType.Credit &&
    account.subtype === AccountSubtype.CreditCard
  );
}

/**
 * Fetch credit-card liability details for an Item. The Liabilities product
 * supplies due dates, minimum payments, statements, and APR details; the
 * account list supplies card names, masks, balances, and limits.
 */
export async function getCreditCardAccounts(
  accessToken: string,
): Promise<CreditCardAccountsResult> {
  try {
    const res = await getClient().liabilitiesGet({
      access_token: accessToken,
    });

    const accountsById = new Map(
      res.data.accounts
        .filter(isCreditCardAccount)
        .map((account) => [account.account_id, account]),
    );

    const accounts = (res.data.liabilities.credit ?? []).flatMap(
      (liability) => {
        if (!liability.account_id) return [];

        const account = accountsById.get(liability.account_id);
        if (!account) return [];

        return [normalizeCreditCard(account, liability)];
      },
    );

    return { status: "ready", accounts };
  } catch (error) {
    const { code, message, httpStatus } = readPlaidError(error);
    if (code === "ITEM_LOGIN_REQUIRED") return { status: "login_required" };
    return { status: "error", message, httpStatus };
  }
}
