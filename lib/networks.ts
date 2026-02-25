export const NETWORKS_BY_ASSET: Record<string, string[]> = {
  BTC: ["bitcoin", "lightning", "liquid"],
  ETH: ["ethereum", "arbitrum", "optimism", "base", "polygon"],
  SOL: ["solana"],
  XRP: ["xrpl"],
  USDT: ["ethereum", "tron", "polygon", "bsc"],
  USDC: ["ethereum", "polygon", "base", "solana"],
  TRX: ["tron"],
  DAI: ["ethereum", "polygon", "arbitrum", "optimism", "base"],
};

export const NETWORK_LABELS: Record<string, string> = {
  bitcoin: "Bitcoin",
  lightning: "Lightning",
  liquid: "Liquid",
  ethereum: "Ethereum (Mainnet)",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  base: "Base",
  polygon: "Polygon",
  solana: "Solana",
  xrpl: "XRPL",
  tron: "Tron",
  bsc: "BNB Smart Chain",
};

const NETWORK_ALIASES: Record<string, string> = {
  btc: "bitcoin",
  onchain: "bitcoin",
  "bitcoin-mainnet": "bitcoin",
  ln: "lightning",
  "lightning-network": "lightning",
  eth: "ethereum",
  erc20: "ethereum",
  sol: "solana",
  spl: "solana",
  trc20: "tron",
  bnb: "bsc",
  "binance-smart-chain": "bsc",
  matic: "polygon",
  ripple: "xrpl",
};

export const normalizeNetworkKey = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return "";
  return NETWORK_ALIASES[normalized] ?? normalized;
};
