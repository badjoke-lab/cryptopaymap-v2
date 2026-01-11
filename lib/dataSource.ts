import { DbUnavailableError, hasDatabaseUrl } from "@/lib/db";

export type DataSourceSetting = "auto" | "db" | "json";
export type DataSourceResult = "db" | "json";

type TimeoutOptions = {
  timeoutMs?: number;
  message?: string;
};

// DATA_SOURCE=auto rules:
// - Respect DATA_SOURCE (server) or NEXT_PUBLIC_DATA_SOURCE (client-visible) when set.
// - auto tries the DB when DATABASE_URL is configured; on timeout/unavailable errors it falls back to JSON.
// - auto does not fall back on valid empty DB results (empty lists are returned as-is).
// - Limited mode is signaled when JSON data is served (forced or fallback).
// - Errors are logged server-side; user-facing responses only indicate limited mode.
const DEFAULT_DB_TIMEOUT_MS = 4500;

const normalizeSetting = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

export const getDataSourceSetting = (): DataSourceSetting => {
  const envValue = normalizeSetting(process.env.DATA_SOURCE);
  if (envValue === "auto" || envValue === "db" || envValue === "json") {
    return envValue;
  }
  const publicValue = normalizeSetting(process.env.NEXT_PUBLIC_DATA_SOURCE);
  if (publicValue === "auto" || publicValue === "db" || publicValue === "json") {
    return publicValue;
  }
  return "auto";
};

export const getDataSourceContext = (setting: DataSourceSetting) => {
  const hasDb = hasDatabaseUrl();
  return {
    setting,
    hasDb,
    shouldAttemptDb: setting !== "json" && hasDb,
    shouldAllowJson: setting !== "db",
  };
};

export const buildDataSourceHeaders = (source: DataSourceResult, limited: boolean) => ({
  "X-CPM-Data-Source": source,
  "X-CPM-Limited": limited ? "true" : "false",
});

export const withDbTimeout = async <T>(promise: Promise<T>, options: TimeoutOptions = {}) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DB_TIMEOUT_MS;
  const message = options.message ?? "DB_TIMEOUT";
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new DbUnavailableError(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
