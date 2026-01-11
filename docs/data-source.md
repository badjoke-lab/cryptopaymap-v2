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

When JSON data is used (forced or fallback), responses include `X-CPM-Limited: true`. This is used by the UI to show the Limited mode banner. The DB path sets `X-CPM-Limited: false`.

## Headers

Responses include these headers:

| Header | Description |
| --- | --- |
| `X-CPM-Data-Source` | `db` or `json` to indicate the source |
| `X-CPM-Limited` | `true` when fallback JSON is used |

## Logging vs user-facing behavior

DB errors and timeouts are logged server-side. User-facing clients only receive the limited mode signal and safe fallback data (or `503` in `db` mode).
