import "server-only";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function parseWallets(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export const wallets = parseWallets(process.env.WALLETS);

export function validateConfiguredWallets(): string | null {
  if (wallets.length === 0) {
    return "WALLETS is not set";
  }

  const invalidAddress = wallets.find(
    (address) => !EVM_ADDRESS_RE.test(address),
  );
  if (invalidAddress) {
    return `Invalid wallet address in WALLETS: ${invalidAddress}`;
  }

  return null;
}
