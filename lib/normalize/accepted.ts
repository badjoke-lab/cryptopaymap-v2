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

export const normalizeAcceptedSql = (columnSql: string) =>
  `CASE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(${columnSql}, '')), '\\s+', ' ', 'g'))
    WHEN 'bitcoin' THEN 'BTC'
    WHEN 'btc' THEN 'BTC'
    WHEN 'btc lightning' THEN 'Lightning'
    WHEN 'btc@lightning' THEN 'Lightning'
    WHEN 'btc/lightning' THEN 'Lightning'
    WHEN 'bitcoin lightning' THEN 'Lightning'
    WHEN 'lightning' THEN 'Lightning'
    WHEN 'ethereum' THEN 'ETH'
    WHEN 'eth' THEN 'ETH'
    WHEN 'tether' THEN 'USDT'
    ELSE NULLIF(REGEXP_REPLACE(BTRIM(COALESCE(${columnSql}, '')), '\\s+', ' ', 'g'), '')
  END`;
