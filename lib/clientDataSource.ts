export const isLimitedHeader = (headers: Headers): boolean => {
  const limitedHeader = headers.get("x-cpm-limited");
  const sourceHeader = headers.get("x-cpm-data-source");

  return limitedHeader === "1" || limitedHeader === "true" || sourceHeader === "json";
};
