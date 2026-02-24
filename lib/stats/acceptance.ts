export const normalizeAcceptanceChainKey = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim();
  return normalized || "unknown";
};
