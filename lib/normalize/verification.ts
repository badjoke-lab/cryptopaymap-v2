export type NormalizedVerification = "owner" | "community" | "directory" | "unverified";

export const normalizeVerificationValue = (value: unknown): NormalizedVerification => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "owner") return "owner";
  if (normalized === "community") return "community";
  if (normalized === "directory") return "directory";
  return "unverified";
};

export const normalizeVerificationSql = (columnSql: string) =>
  `CASE
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'owner' THEN 'owner'
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'community' THEN 'community'
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'directory' THEN 'directory'
    ELSE 'unverified'
  END`;
