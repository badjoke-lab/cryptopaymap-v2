export type AssetCatalogEntry = {
  symbol: string;
  name: string;
  aliases: string[];
};

export const ASSET_CATALOG: AssetCatalogEntry[] = [
  { symbol: "BTC", name: "Bitcoin", aliases: ["xbt"] },
  { symbol: "ETH", name: "Ethereum", aliases: ["ether"] },
  { symbol: "USDT", name: "Tether", aliases: ["tether usd", "usd t"] },
  { symbol: "USDC", name: "USD Coin", aliases: ["usdcoin", "circle usdc"] },
  { symbol: "SOL", name: "Solana", aliases: [] },
  { symbol: "XRP", name: "XRP", aliases: ["ripple"] },
  { symbol: "BNB", name: "BNB", aliases: ["binance coin"] },
  { symbol: "ADA", name: "Cardano", aliases: [] },
  { symbol: "DOGE", name: "Dogecoin", aliases: [] },
  { symbol: "TRX", name: "TRON", aliases: ["tron"] },
  { symbol: "DAI", name: "Dai", aliases: [] },
  { symbol: "LTC", name: "Litecoin", aliases: [] },
  { symbol: "BCH", name: "Bitcoin Cash", aliases: [] },
  { symbol: "DOT", name: "Polkadot", aliases: [] },
  { symbol: "AVAX", name: "Avalanche", aliases: [] },
  { symbol: "LINK", name: "Chainlink", aliases: [] },
  { symbol: "UNI", name: "Uniswap", aliases: [] },
  { symbol: "XLM", name: "Stellar", aliases: ["lumens"] },
  { symbol: "XMR", name: "Monero", aliases: [] },
  { symbol: "ATOM", name: "Cosmos", aliases: [] },
  { symbol: "MATIC", name: "Polygon", aliases: [] },
  { symbol: "ARB", name: "Arbitrum", aliases: [] },
  { symbol: "OP", name: "Optimism", aliases: [] },
  { symbol: "AAVE", name: "Aave", aliases: [] },
  { symbol: "NEAR", name: "NEAR Protocol", aliases: [] },
  { symbol: "APT", name: "Aptos", aliases: [] },
  { symbol: "SUI", name: "Sui", aliases: [] },
  { symbol: "ETC", name: "Ethereum Classic", aliases: [] },
  { symbol: "FIL", name: "Filecoin", aliases: [] },
  { symbol: "HBAR", name: "Hedera", aliases: [] },
  { symbol: "ICP", name: "Internet Computer", aliases: [] },
  { symbol: "VET", name: "VeChain", aliases: [] },
  { symbol: "MKR", name: "Maker", aliases: [] },
  { symbol: "ALGO", name: "Algorand", aliases: [] },
  { symbol: "EGLD", name: "MultiversX", aliases: ["elrond"] },
  { symbol: "THETA", name: "Theta Network", aliases: [] },
  { symbol: "XTZ", name: "Tezos", aliases: [] },
  { symbol: "EOS", name: "EOS", aliases: [] },
  { symbol: "FLOW", name: "Flow", aliases: [] },
  { symbol: "KAS", name: "Kaspa", aliases: [] },
  { symbol: "RUNE", name: "THORChain", aliases: [] },
  { symbol: "GRT", name: "The Graph", aliases: [] },
  { symbol: "SNX", name: "Synthetix", aliases: [] },
  { symbol: "SAND", name: "The Sandbox", aliases: [] },
  { symbol: "MANA", name: "Decentraland", aliases: [] },
  { symbol: "CHZ", name: "Chiliz", aliases: [] },
  { symbol: "AXS", name: "Axie Infinity", aliases: [] },
  { symbol: "QNT", name: "Quant", aliases: [] },
  { symbol: "CRV", name: "Curve DAO Token", aliases: [] },
  { symbol: "COMP", name: "Compound", aliases: [] },
  { symbol: "KSM", name: "Kusama", aliases: [] },
  { symbol: "NEO", name: "NEO", aliases: [] },
  { symbol: "ZEC", name: "Zcash", aliases: [] },
  { symbol: "DASH", name: "Dash", aliases: [] },
  { symbol: "WAVES", name: "Waves", aliases: [] },
  { symbol: "MINA", name: "Mina", aliases: [] },
  { symbol: "ROSE", name: "Oasis Network", aliases: [] },
  { symbol: "KAVA", name: "Kava", aliases: [] },
  { symbol: "IOTA", name: "IOTA", aliases: [] },
  { symbol: "ZIL", name: "Zilliqa", aliases: [] },
  { symbol: "ENJ", name: "Enjin Coin", aliases: [] },
  { symbol: "BAT", name: "Basic Attention Token", aliases: [] },
];

export const normalizeAssetKey = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();

const normalizeSearch = (value: string) => value.trim().toLowerCase().replace(/[\s_.-]+/g, "");

const tokenPrefixMatch = (haystack: string, query: string) => {
  const words = haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => word.startsWith(query));
};

export type AssetSuggestion = {
  symbol: string;
  label: string;
  score: number;
};

export const getAssetSuggestions = (
  query: string,
  entries: AssetCatalogEntry[],
  selectedAssets: string[],
  max = 12,
): AssetSuggestion[] => {
  const q = normalizeSearch(query);
  if (!q) return [];

  const selected = new Set(selectedAssets.map((asset) => normalizeAssetKey(asset)));
  const allowSubstring = q.length >= 3;

  const ranked = entries
    .map((entry) => {
      const symbolNorm = normalizeSearch(entry.symbol);
      const nameNorm = normalizeSearch(entry.name);
      const aliasNorm = entry.aliases.map((alias) => normalizeSearch(alias));

      let score = 0;
      if (symbolNorm.startsWith(q)) score = 400;
      else if (nameNorm.startsWith(q)) score = 300;
      else if (
        tokenPrefixMatch(entry.name, q) ||
        tokenPrefixMatch(entry.symbol, q) ||
        entry.aliases.some((alias) => tokenPrefixMatch(alias, q))
      ) {
        score = 200;
      } else if (allowSubstring && (symbolNorm.includes(q) || nameNorm.includes(q) || aliasNorm.some((alias) => alias.includes(q)))) {
        score = 100;
      }

      if (!score) return null;
      const symbol = normalizeAssetKey(entry.symbol);
      if (selected.has(symbol)) return null;

      return {
        symbol,
        label: `${entry.name} (${symbol})`,
        score,
      } satisfies AssetSuggestion;
    })
    .filter((item): item is AssetSuggestion => Boolean(item));

  return ranked
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, max);
};
