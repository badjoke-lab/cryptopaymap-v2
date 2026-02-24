export const RAIL_KEY_DICTIONARY: Record<string, string> = {
  bitcoin: "bitcoin",
  btc: "bitcoin",
  onchain: "bitcoin",
  "bitcoin-mainnet": "bitcoin",
  lightning: "lightning",
  ln: "lightning",
  "lightning-network": "lightning",
  ethereum: "ethereum",
  eth: "ethereum",
  erc20: "ethereum",
  solana: "solana",
  sol: "solana",
  spl: "solana",
  tron: "tron",
  trc20: "tron",
  polygon: "polygon",
  matic: "polygon",
  bsc: "bsc",
  bnb: "bsc",
  "binance-smart-chain": "bsc",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  liquid: "liquid",
};

export const normalizeRail = (railKey: string | undefined): string => {
  if (!railKey) return "unknown";
  const normalized = railKey.trim().toLowerCase();
  if (!normalized) return "unknown";
  return RAIL_KEY_DICTIONARY[normalized] ?? "custom";
};
