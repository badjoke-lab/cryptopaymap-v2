export type PaymentAccept = {
  asset: string | null;
  chain: string | null;
};

export const normalizeAccepted = (
  payments: PaymentAccept[],
  fallback?: string[],
): string[] => {
  if (payments.length === 0) {
    return fallback ?? [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const payment of payments) {
    const asset = payment.asset?.trim().toUpperCase() ?? null;
    const chain = payment.chain?.trim().toUpperCase() ?? null;
    let label: string | null = null;

    if (
      chain === "LIGHTNING" ||
      chain === "LN" ||
      asset === "LIGHTNING" ||
      (asset === "BTC" && chain === "LIGHTNING")
    ) {
      label = "Lightning";
    } else if (asset) {
      label = asset;
    } else if (chain) {
      label = chain;
    }

    if (label && !seen.has(label)) {
      seen.add(label);
      normalized.push(label);
    }
  }

  if (normalized.length === 0 && fallback?.length) {
    return fallback;
  }

  return normalized;
};
