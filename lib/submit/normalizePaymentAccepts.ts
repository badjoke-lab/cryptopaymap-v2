import { normalizeRail } from "@/lib/rails";

export type PaymentAcceptInput = {
  asset_key: string;
  rail_key: string;
  rail_raw?: string;
};

type SubmissionErrors = Record<string, string>;

type NormalizePaymentAcceptsResult =
  | { ok: true; value?: PaymentAcceptInput[] }
  | { ok: false; errors: SubmissionErrors };

const normalizeAssetKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\s+/g, "").toUpperCase();
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const normalizePaymentAccepts = (value: unknown): NormalizePaymentAcceptsResult => {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!Array.isArray(value)) {
    return { ok: false, errors: { payment_accepts: "Must be an array" } };
  }

  const errors: SubmissionErrors = {};
  const normalizedRows: PaymentAcceptInput[] = [];

  value.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      errors[`payment_accepts[${index}]`] = "Must be an object";
      return;
    }

    const paymentRow = row as Record<string, unknown>;
    const assetKey = normalizeAssetKey(paymentRow.asset_key);
    if (!assetKey) {
      errors[`payment_accepts[${index}].asset_key`] = "Required";
    }

    const rawRailKey = normalizeString(paymentRow.rail_key);
    const railKey = normalizeRail(rawRailKey);
    const railRaw = normalizeString(paymentRow.rail_raw);

    if (railKey === "custom" && !railRaw) {
      errors[`payment_accepts[${index}].rail_raw`] = "Required when rail_key is custom";
    }

    if (assetKey) {
      normalizedRows.push({
        asset_key: assetKey,
        rail_key: railKey,
        ...(railKey === "custom" && railRaw ? { rail_raw: railRaw } : {}),
      });
    }
  });

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: normalizedRows };
};
