export type PaymentAccept = {
  asset: string | null;
  chain: string | null;
  is_preferred?: boolean | null;
};

const LIGHTNING_LABEL = "Lightning";

const normalizeLightning = (asset?: string | null, chain?: string | null): string | null => {
  const assetUpper = asset?.trim().toUpperCase();
  const chainUpper = chain?.trim().toUpperCase();

  if (
    chainUpper === "LIGHTNING" ||
    chainUpper === "LN" ||
    assetUpper === "LIGHTNING" ||
    (assetUpper === "BTC" && chainUpper === "LIGHTNING")
  ) {
    return LIGHTNING_LABEL;
  }

  return null;
};

const normalizePaymentLabel = (payment: PaymentAccept): { label: string; preferred: boolean } | null => {
  const lightning = normalizeLightning(payment.asset, payment.chain);
  if (lightning) {
    return { label: lightning, preferred: Boolean(payment.is_preferred) };
  }

  const assetUpper = payment.asset?.trim().toUpperCase();
  const chainUpper = payment.chain?.trim().toUpperCase();

  if (assetUpper) {
    return { label: assetUpper, preferred: Boolean(payment.is_preferred) };
  }

  if (chainUpper) {
    return { label: chainUpper, preferred: Boolean(payment.is_preferred) };
  }

  return null;
};

const normalizeFallbackLabel = (value: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (upper === "LN" || upper.includes("LIGHTNING")) {
    return LIGHTNING_LABEL;
  }

  return upper;
};

const normalizeFallbackAccepted = (fallback?: string[]): string[] => {
  if (!fallback?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of fallback) {
    const label = normalizeFallbackLabel(value);
    const key = label?.toUpperCase();

    if (!label || !key || seen.has(key)) continue;

    seen.add(key);
    normalized.push(label);
  }

  return normalized;
};

export const normalizeAccepted = (payments: PaymentAccept[], fallback?: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: { label: string; preferred: boolean }[] = [];

  for (const payment of payments) {
    const entry = normalizePaymentLabel(payment);
    const key = entry?.label?.toUpperCase();

    if (!entry || !key || seen.has(key)) continue;

    seen.add(key);
    normalized.push(entry);
  }

  if (normalized.length === 0) {
    return normalizeFallbackAccepted(fallback);
  }

  normalized.sort((a, b) => {
    if (a.preferred !== b.preferred) {
      return Number(b.preferred) - Number(a.preferred);
    }

    return a.label.localeCompare(b.label);
  });

  return normalized.map((entry) => entry.label);
};
