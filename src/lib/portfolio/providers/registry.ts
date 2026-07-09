import "server-only";

import { revalidatePath } from "next/cache";

import { withTransactionJournalSummaries } from "@/lib/journal/transaction-entry";

import { brokerageAdapter } from "./brokerage-adapter";
import {
  createPortfolioProviderRegistry,
  type PortfolioProviderRegistry,
} from "./create-registry";
import { krakenAdapter } from "./kraken-adapter";
import { walletAdapter } from "./wallet-adapter";

function revalidatePortfolioPaths() {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchange");
  revalidatePath("/brokerages");
}

/**
 * The Portfolio Provider Registry, wired to the three real provider adapters.
 * The single entry point for cross-provider balances, transactions, and the
 * synchronous balance refresh (shared by the human "Refresh" action and the
 * AI-agent refresh path).
 */
export const portfolioProviderRegistry: PortfolioProviderRegistry =
  createPortfolioProviderRegistry({
    adapters: [walletAdapter, krakenAdapter, brokerageAdapter],
    walletAdapter,
    revalidate: revalidatePortfolioPaths,
    decorateTransactions: withTransactionJournalSummaries,
  });
