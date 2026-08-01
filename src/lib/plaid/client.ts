import "server-only";

import {
  Configuration,
  CountryCode,
  CreditAccountSubtype,
  DepositoryAccountSubtype,
  InvestmentAccountSubtype,
  type LinkTokenAccountFilters,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
} from "plaid";

export const plaidAccountFamilies = [
  "checking",
  "savings",
  "credit_card",
  "brokerage",
] as const;

export type PlaidAccountFamily = (typeof plaidAccountFamilies)[number];

type PlaidEnv = "sandbox" | "production";

function getPlaidEnv(): PlaidEnv {
  // Vercel exposes VERCEL_ENV at build and runtime when system environment
  // variables are enabled. Local dev and preview deployments use Plaid sandbox;
  // production deployments use Plaid production.
  return process.env.VERCEL_ENV === "production" ? "production" : "sandbox";
}

/**
 * Plaid is only integrated against its production environment. The sandbox
 * implementation is deliberately not maintained, and production access tokens
 * are rejected by the sandbox host, so outside production deployments every
 * Plaid-backed sync is skipped rather than attempted and recorded as an error.
 */
export function isPlaidEnabled(): boolean {
  return getPlaidEnv() === "production";
}

let cachedClient: PlaidApi | null = null;

/**
 * The shared Plaid SDK client. Both the brokerage (Investments) and depository
 * (checking/savings) domains use a single Item per institution login, so they
 * share this one client + the helpers below.
 */
export function getClient(): PlaidApi {
  if (cachedClient) return cachedClient;

  const plaidEnv = getPlaidEnv();
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret =
    plaidEnv === "production"
      ? process.env.PLAID_PRODUCTION_SECRET
      : process.env.PLAID_SANDBOX_SECRET;

  if (!clientId) throw new Error("PLAID_CLIENT_ID is not set");
  if (!secret) {
    throw new Error(
      `Plaid secret is not set for env "${plaidEnv}" (expected ${
        plaidEnv === "production"
          ? "PLAID_PRODUCTION_SECRET"
          : "PLAID_SANDBOX_SECRET"
      })`,
    );
  }

  cachedClient = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[plaidEnv],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    }),
  );

  return cachedClient;
}

// Plaid errors come back as an axios error whose `response.data` holds the
// structured Plaid error body. Pull out what we need without importing axios.
type PlaidErrorBody = { error_code?: string; error_message?: string };

export function readPlaidError(error: unknown): {
  code: string | null;
  message: string;
  httpStatus: number;
} {
  const response = (
    error as { response?: { status?: number; data?: PlaidErrorBody } }
  ).response;
  return {
    code: response?.data?.error_code ?? null,
    message:
      response?.data?.error_message ??
      (error instanceof Error ? error.message : "Unknown Plaid error"),
    httpStatus: response?.status ?? 502,
  };
}

const PLAID_ACCOUNT_FAMILY_SET = new Set<string>(plaidAccountFamilies);

export function normalizePlaidAccountFamilies(
  families: readonly string[],
): PlaidAccountFamily[] {
  const normalized: PlaidAccountFamily[] = [];
  for (const family of families) {
    if (!PLAID_ACCOUNT_FAMILY_SET.has(family)) continue;
    if (normalized.includes(family as PlaidAccountFamily)) continue;
    normalized.push(family as PlaidAccountFamily);
  }
  return normalized;
}

function selectedProducts(families: readonly PlaidAccountFamily[]): Products[] {
  const products: Products[] = [];

  if (families.includes("brokerage")) {
    products.push(Products.Investments);
  }

  if (families.includes("credit_card")) {
    products.push(Products.Liabilities);
  }

  for (const family of families) {
    if (
      (family === "checking" || family === "savings") &&
      !products.includes(Products.Auth)
    ) {
      products.push(Products.Auth);
    }
  }

  return products;
}

function accountFiltersForFamilies(
  families: readonly PlaidAccountFamily[],
): LinkTokenAccountFilters {
  const accountFilters: LinkTokenAccountFilters = {};
  const depositorySubtypes: DepositoryAccountSubtype[] = [];

  if (families.includes("checking")) {
    depositorySubtypes.push(DepositoryAccountSubtype.Checking);
  }
  if (families.includes("savings")) {
    depositorySubtypes.push(DepositoryAccountSubtype.Savings);
  }
  if (depositorySubtypes.length > 0) {
    accountFilters.depository = { account_subtypes: depositorySubtypes };
  }

  if (families.includes("credit_card")) {
    accountFilters.credit = {
      account_subtypes: [CreditAccountSubtype.CreditCard],
    };
  }

  if (families.includes("brokerage")) {
    accountFilters.investment = {
      account_subtypes: [InvestmentAccountSubtype.All],
    };
  }

  return accountFilters;
}

function linkTokenProducts(families: readonly PlaidAccountFamily[]): {
  products: Products[];
  requiredIfSupportedProducts: Products[];
} {
  const products = selectedProducts(families);
  const [primaryProduct, ...requiredIfSupportedProducts] = products;

  if (!primaryProduct) {
    throw new Error("At least one supported Plaid account family is required");
  }

  return {
    products: [primaryProduct],
    requiredIfSupportedProducts,
  };
}

/**
 * Create a short-lived link_token used to boot the Plaid Link UI on the client.
 * With multiple selected products, the highest-signal product initializes Link
 * and the rest are required when the institution/account supports them,
 * preserving wider institution compatibility.
 */
export async function createLinkToken(
  userId: string,
  families: readonly PlaidAccountFamily[],
): Promise<string> {
  // OAuth institutions (e.g. Schwab) require a redirect_uri that exactly
  // matches one registered in the Plaid Dashboard. Only send it when set so
  // non-OAuth / sandbox flows that don't need it still work.
  const redirectUri = process.env.PLAID_REDIRECT_URI;

  const { products, requiredIfSupportedProducts } = linkTokenProducts(families);
  const accountFilters = accountFiltersForFamilies(families);

  const res = await getClient().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Holdsight",
    products,
    country_codes: [CountryCode.Us],
    language: "en",
    account_filters: accountFilters,
    ...(requiredIfSupportedProducts.length > 0
      ? { required_if_supported_products: requiredIfSupportedProducts }
      : {}),
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  });

  return res.data.link_token;
}

/**
 * Exchange the public_token returned by Plaid Link for the long-lived
 * access_token (the secret we encrypt + store) and the item_id.
 */
export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const res = await getClient().itemPublicTokenExchange({
    public_token: publicToken,
  });

  return { accessToken: res.data.access_token, itemId: res.data.item_id };
}

/**
 * Resolve the institution id + display name for an Item, so we can label the
 * stored plaid_items row (e.g. "Charles Schwab").
 */
export async function getInstitution(accessToken: string): Promise<{
  institutionId: string | null;
  institutionName: string | null;
}> {
  const itemRes = await getClient().itemGet({ access_token: accessToken });
  const institutionId = itemRes.data.item.institution_id ?? null;
  if (!institutionId) return { institutionId: null, institutionName: null };

  const instRes = await getClient().institutionsGetById({
    institution_id: institutionId,
    country_codes: [CountryCode.Us],
  });

  return {
    institutionId,
    institutionName: instRes.data.institution.name,
  };
}

/**
 * Revoke an Item at Plaid (invalidates the access token). Best-effort: callers
 * should still delete local rows even if this throws (e.g. a stale sandbox
 * token being revoked against the production API).
 */
export async function removeItem(accessToken: string): Promise<void> {
  await getClient().itemRemove({ access_token: accessToken });
}

export type PlaidDepositoryAccount = {
  externalAccountId: string; // Plaid account_id
  name: string;
  mask: string | null;
  kind: "checking" | "savings";
  currentBalance: number;
  currency: string;
};

export type DepositoryAccountsResult =
  | { status: "ready"; accounts: PlaidDepositoryAccount[] }
  | { status: "login_required" }
  | { status: "error"; message: string; httpStatus: number };

function toDepositoryKind(
  subtype: string | null | undefined,
): "checking" | "savings" {
  return subtype === "savings" ? "savings" : "checking";
}

/**
 * Fetch the depository (checking/savings) accounts under an Item via
 * /accounts/get. Balances are cached (no Balance product, no per-call billing),
 * which is fine for on-demand net-worth refreshes.
 */
export async function getDepositoryAccounts(
  accessToken: string,
): Promise<DepositoryAccountsResult> {
  try {
    const res = await getClient().accountsGet({ access_token: accessToken });

    const accounts = res.data.accounts
      .filter((account: AccountBase) => account.type === "depository")
      .map((account: AccountBase) => ({
        externalAccountId: account.account_id,
        name: account.name,
        mask: account.mask ?? null,
        kind: toDepositoryKind(account.subtype),
        currentBalance: account.balances.current ?? 0,
        currency: account.balances.iso_currency_code ?? "USD",
      }));

    return { status: "ready", accounts };
  } catch (error) {
    const { code, message, httpStatus } = readPlaidError(error);
    if (code === "ITEM_LOGIN_REQUIRED") return { status: "login_required" };
    return { status: "error", message, httpStatus };
  }
}
