export const isLimitedHeader = (headers: Headers): boolean => {
  const limitedHeader = headers.get("x-cpm-limited");
  const sourceHeader = headers.get("x-cpm-data-source");

  return limitedHeader === "1" || limitedHeader === "true" || sourceHeader === "json";
};

export const getLastUpdatedHeader = (headers: Headers): string | null => {
  const value = headers.get("x-cpm-last-updated");
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};
