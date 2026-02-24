const ALIAS: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  "btc lightning": "Lightning",
  "btc@lightning": "Lightning",
  "btc/lightning": "Lightning",
  "bitcoin lightning": "Lightning",
  lightning: "Lightning",
  ethereum: "ETH",
  eth: "ETH",
  tether: "USDT",
};

const SPACE_RE = /\s+/g;

const normalizeRaw = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(SPACE_RE, " ");
};

export const normalizeAcceptedToken = (value: unknown): string => {
  const raw = normalizeRaw(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  return ALIAS[lower] ?? raw;
};

export const normalizeAcceptedValues = (values: unknown[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeAcceptedToken(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};
