# DATA_SOURCE / NEXT_PUBLIC_DATA_SOURCE

This controls how `/api/places`, `/api/stats`, and `/api/filters/meta` select their data source. The default is `auto` so the UI remains available even if the database is unavailable.

## Precedence

1. `DATA_SOURCE`
2. `NEXT_PUBLIC_DATA_SOURCE`
3. Default: `auto`

## Values and behavior

| Value | Behavior |
| --- | --- |
| `auto` | Try the DB first. If the DB is unreachable, times out, or throws an availability error, fall back to JSON. Valid empty DB results are returned as-is (no fallback). |
| `db` | Use the DB only. If the DB is unavailable, return `503`. |
| `json` | Always use JSON data (fallback mode). |

## Limited mode

When JSON data is used (forced or fallback), responses include `x-cpm-limited: 1`. This is used by the UI to show the Limited mode banner. DB-only errors can also return `x-cpm-limited: 1` to signal degraded data availability.

## Headers

Responses include these headers:

| Header | Description |
| --- | --- |
| `x-cpm-data-source` | `db` or `json` to indicate the source |
| `x-cpm-limited` | `1` when fallback/limited mode is active, `0` otherwise |

## Auto mode quick check

`auto` uses the DB when `DATABASE_URL` is configured and reachable; it falls back to JSON if the DB is unavailable or times out. If `DATABASE_URL` is not set, `auto` immediately uses JSON.

## Local fallback reproduction

1. Set `DATA_SOURCE=auto`.
2. Use an invalid `DATABASE_URL` (or stop your DB) to force a timeout/unavailable error.
3. Request `/api/places`, `/api/stats`, or `/api/filters/meta` and confirm headers `x-cpm-data-source: json` and `x-cpm-limited: 1`.

## Logging vs user-facing behavior

DB errors and timeouts are logged server-side. User-facing clients only receive the limited mode signal and safe fallback data (or `503` in `db` mode).
