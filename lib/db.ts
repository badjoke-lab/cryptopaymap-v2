import { Pool, type PoolClient, type QueryResultRow } from "pg";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [200, 400];

let pool: Pool | null = null;

type Queryable = Pool | PoolClient;

type DbQueryOptions = {
  route: string;
  client?: PoolClient;
  retry?: boolean;
};

export class DbUnavailableError extends Error {
  code: string;

  constructor(message = "DB_UNAVAILABLE", options?: { cause?: unknown }) {
    super(message);
    this.name = "DbUnavailableError";
    this.code = "DB_UNAVAILABLE";
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

const getErrorDetails = (error: unknown) => {
  if (error && typeof error === "object") {
    const err = error as { code?: string; message?: string; stack?: string };
    return {
      code: err.code,
      message: err.message,
      stack: err.stack,
    };
  }
  return {
    code: undefined,
    message: String(error),
    stack: undefined,
  };
};

const sanitizeMessage = (message: string) =>
  message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/password=([^&\s]+)/gi, "password=***");

const logDbFailure = (route: string, attempt: number, error: unknown) => {
  const { code, message, stack } = getErrorDetails(error);
  const payload = {
    route,
    attempt,
    code,
    message: message ? sanitizeMessage(message) : "Unknown database error",
  };

  if (process.env.NODE_ENV === "production") {
    console.error("[db] query failed", payload);
  } else {
    console.error("[db] query failed", {
      ...payload,
      stack,
    });
  }
};

const isTransientDbError = (error: unknown) => {
  const { code, message } = getErrorDetails(error);
  if (code === "XX000") return true;

  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("control plane request failed")) return true;

  if (code && ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"].includes(code)) {
    return true;
  }

  return Boolean(
    normalized.includes("connection terminated") ||
      normalized.includes("connection reset") ||
      normalized.includes("timeout"),
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getPoolConfig = (connectionString: string) => {
  const sslRequired = (() => {
    try {
      const url = new URL(connectionString);
      const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
      const sslFlag = url.searchParams.get("ssl")?.toLowerCase();
      if (sslFlag === "true") return true;
      return Boolean(sslMode && ["require", "verify-ca", "verify-full"].includes(sslMode));
    } catch {
      return /sslmode=require|ssl=true/i.test(connectionString);
    }
  })();

  return {
    connectionString,
    max: 4,
    connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 20000,
    ssl: sslRequired ? true : undefined,
  };
};

export const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL);

export const getDbPool = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool(getPoolConfig(connectionString));
  }

  return pool;
};

export const isDbUnavailableError = (error: unknown): error is DbUnavailableError =>
  error instanceof DbUnavailableError;

export const getDbClient = async (route: string) => {
  const poolInstance = getDbPool();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await poolInstance.connect();
    } catch (error) {
      logDbFailure(route, attempt, error);

      if (attempt < MAX_ATTEMPTS && isTransientDbError(error)) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1) ?? 0;
        await sleep(backoff);
        continue;
      }

      if (isTransientDbError(error)) {
        throw new DbUnavailableError("DB_UNAVAILABLE", { cause: error });
      }

      throw error;
    }
  }

  throw new DbUnavailableError("DB_UNAVAILABLE");
};

export const dbQuery = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  options?: DbQueryOptions,
) => {
  const route = options?.route ?? "unknown";
  const queryable: Queryable = options?.client ?? getDbPool();
  const shouldRetry = options?.retry ?? true;
  const attempts = shouldRetry ? MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await queryable.query<T>(text, params);
    } catch (error) {
      logDbFailure(route, attempt, error);

      if (attempt < attempts && isTransientDbError(error)) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1) ?? 0;
        await sleep(backoff);
        continue;
      }

      if (isTransientDbError(error)) {
        throw new DbUnavailableError("DB_UNAVAILABLE", { cause: error });
      }

      throw error;
    }
  }

  throw new DbUnavailableError("DB_UNAVAILABLE");
};
