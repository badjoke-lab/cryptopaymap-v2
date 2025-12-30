# Database connection contract

This document is the source of truth for how the application connects to Postgres and how
database failures map to API responses.

## Required environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string used by API routes, scripts, and smoke checks. |

Notes:
- Connection strings may include `ssl=true` or `sslmode=require`/`verify-ca`/`verify-full` to force SSL.
- If `DATABASE_URL` is missing, DB-backed routes fail fast and smoke/API checks are skipped.

## Pool settings

The shared pool is created in `lib/db.ts` and reused across routes.

- `max`: **4** connections
- `idleTimeoutMillis`: **20000** (20s)
- `connectionTimeoutMillis`: **7000** (7s)
- `ssl`: enabled when the connection string includes `ssl=true` or `sslmode=require|verify-ca|verify-full`

## Timeout strategy

- Connection acquisition is capped by `connectionTimeoutMillis` (7s).
- No `statement_timeout` or per-query timeout is set in code; Postgres defaults apply.
- If timeouts are needed, update the connection string or add server-side defaults.

## Retry strategy

Retries are implemented in `lib/db.ts` for both `dbQuery` and `getDbClient`.

- Max attempts: **3** (initial try + 2 retries).
- Backoff: **200ms**, then **400ms** for subsequent retries.
- Retries only occur on transient errors, including:
  - Postgres `XX000`
  - Network/driver codes (`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `ECONNREFUSED`)
  - Messages containing `connection terminated`, `connection reset`, `timeout`,
    or `control plane request failed`
- After exhausting retries on transient errors, a `DbUnavailableError` is thrown.
- Callers may disable retries by passing `{ retry: false }` (used for transactional flows).

## API error mapping policy

The API uses a consistent mapping for database-related failures:

- **503 Service Unavailable**: returned when a `DbUnavailableError` is raised
  (e.g., `/api/places`, `/api/places/[id]`, `/api/submissions/[id]/promote`,
  `/api/health`).
- **404 Not Found**: returned when a specific record is missing
  (e.g., `/api/places/[id]`, `/api/submissions/[id]/promote`).
- **400 Bad Request**: returned when input is invalid or a submission is in an
  invalid state (e.g., `/api/submissions/[id]/status`, `/api/submissions/[id]/promote`).
- **500 Internal Server Error**: returned for unexpected failures, including
  schema mismatches or unhandled database errors.

For other endpoints, unhandled exceptions follow Next.js defaults (500).
