# Stats Audit Report (v4.0 → v4.1 Gap Analysis)

## 1. Current Implementation Summary

- Current implementation has reached **v4.0-level behavior** in key areas (Snapshot + Trends sections, period switching, and filter-independent Trends), but has **not reached v4.1 architecture** (precomputed cubes + filter-consistent Trends).
- Snapshot currently updates by filter and is fetched from `GET /api/stats` with query-based filters.
- Trends currently updates by range only (`24h/7d/30d/all`) and is fetched from `GET /api/stats/trends?range=...`.
- Relationship between Filters and Trends:
  - **Current behavior:** Filters affect Snapshot only.
  - **v4.0 expectation:** This is correct.
  - **v4.1 expectation:** This is a gap (Trends must use same filters as Snapshot).

## 2. Implementation Map

### UI

Related files:
- `app/(site)/stats/page.tsx`
- `app/(site)/stats/StatsPageClient.tsx`

Snapshot composition (implemented):
- Total cards (Total places / Countries / Cities / Categories)
- Verification Breakdown (donut)
- Chains / Assets bars
- Ranking tables (Category / Country / City)
- Asset Acceptance Matrix

Trends composition (implemented):
- Range selector: `24h`, `7d`, `30d`, `All`
- KPI lines: Total / Verified / Accepting any crypto
- Verification stacked trend
- Last updated + grain display

Range selector implementation:
- Present in UI and wired to Trends refetch.
- Grain mapping is provided by Trends API response.

Error / zero / cache fallback handling:
- Zero-data visualization exists (empty series can be rendered as zero values).
- On API unavailable states, a warning block is rendered and chart sections are hidden.
- Explicit “last successful payload cache” for Trends/Snapshot is **not** implemented in client state.

### API

Stats-related endpoints:
- `GET /api/stats`
- `GET /api/stats/trends`

Response shape:
- `/api/stats`: extended snapshot payload (totals, breakdown, rankings, matrix, acceptance coverage metadata).
- `/api/stats/trends`: range/grain, cumulative KPI points, verification stack, optional meta reason.

Cache settings:
- `/api/stats`: `revalidate = 7200` + `Cache-Control: public, s-maxage=7200, stale-while-revalidate=600`
- `/api/stats/trends`: `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`

On-demand aggregation:
- `/api/stats/trends` currently performs live aggregation from `history` (+ `verifications` / `payment_accepts` checks), i.e. on-demand SQL aggregation exists.

### DB

`stats_timeseries` equivalent table:
- **Not found** in current migrations/schema files.

Precomputed cube storage structure:
- **Not found**.

`dim_type` / `dim_key` structure:
- **Not found** in implementation code/migrations.

### Jobs / Cron

Hourly / daily / weekly update processing:
- **Not found** in repository workflows/scripts for Stats cube generation.

TopN fixed processing:
- **Not found** as a scheduled precompute mechanism for Trends cubes.

## 3. v4.0 Compliance Check

Reference: `docs/stats-v4.0.md`

### Snapshot complete parity
- **Status:** OK
- **Evidence:** `StatsPageClient` renders total cards, donut, chains/assets, rankings, and asset matrix from `/api/stats` payload.

### Trends period switching (24h/7d/30d/All)
- **Status:** OK
- **Evidence:** UI range buttons exist and trigger `setTrendRange`; Trends API supports those ranges with grain mapping `1h/1d/1d/1w`.

### Filter-independent Trends principle
- **Status:** OK
- **Evidence:** Trends fetch only sends `range`, no filter params; Snapshot fetch sends filter query.

### Zero-line handling
- **Status:** Partial
- **Evidence:** Trends can produce zero-filled payloads for no-history conditions; however, on unavailable/error state, full chart sections are hidden rather than always forcing visible zero-lines.

### White-screen prevention (failure handling)
- **Status:** Partial
- **Evidence:** Page does not go blank (warning UI remains), but v4.0’s explicit “last success cache then zero-line” behavior is not fully implemented.

## 4. v4.1 Gap Analysis

Reference: `docs/stats-v4.1.md`

### Requirement: Trends must match Snapshot filters
#### Current state
- Trends API/UI flow is range-only and filter-independent.
#### Gap
- Snapshot/Trends condition consistency is not implemented.
#### Required task
- Pass filter context to Trends API and resolve by supported cube dimensions.

### Requirement: `stats_timeseries` table (grain/dim_type/dim_key + metrics)
#### Current state
- No such table/migration found.
#### Gap
- Core persistence layer for v4.1 is missing.
#### Required task
- Add storage table and indexes/PK aligned to spec.

### Requirement: Precomputed cubes only (no heavy on-demand SQL)
#### Current state
- Trends endpoint computes with live SQL over history-derived data.
#### Gap
- Violates v4.1 “saved cubes only” principle.
#### Required task
- Replace live aggregation path with cube-read path.

### Requirement: Composite dimensions and fallback-cube transparency
#### Current state
- No `dim_type/dim_key` model and no fallback cube annotation in response.
#### Gap
- Cannot serve/declare supported composite combinations per v4.1.
#### Required task
- Implement dimension resolution policy + explicit response metadata for fallback/non-supported combos.

### Requirement: Update interval controls (hourly/daily/weekly)
#### Current state
- No stats cube cron/scheduled jobs found.
#### Gap
- Cannot guarantee required refresh cadence.
#### Required task
- Implement scheduled jobs for 1h/1d/1w generation windows (including 48h recompute rule).

### Requirement: Saved-only response policy
#### Current state
- Trends generated directly from source tables each request.
#### Gap
- API may return data not backed by persisted cubes.
#### Required task
- Enforce read-only from persisted cubes; reject or fallback transparently when missing.

### Requirement: Alternative cube display with explicit note
#### Current state
- Meta includes generic reason fields only (no cube-kind/fallback disclosure).
#### Gap
- Missing explicit “which cube served” and fallback disclosure.
#### Required task
- Add response metadata: used cube type, fallback reason, unsupported-combination notice.

### Requirement: Top5 fixed logic (period-total fixed ranking)
#### Current state
- Only verification stack trend is implemented; no Top5 category/country/asset trend with fixed legends.
#### Gap
- Missing required v4.1 breakdown trend behavior.
#### Required task
- Implement Top5 period-fixed ranking and corresponding trend series output.

## 5. Risk Assessment

- Data growth load risk:
  - Current live aggregation path can become expensive as history grows.
- Filter explosion risk:
  - v4.1 dimension combinations can explode without strict cube coverage policy.
- Cache strategy insufficiency:
  - Existing endpoint cache headers alone do not substitute cube persistence/warm-cache policy.
- Cron operational dependency risk:
  - v4.1 freshness guarantees depend on robust scheduled jobs and monitoring.
- Structural risk in current design:
  - API-level runtime aggregation model conflicts with v4.1 architectural requirements.

## 6. Conclusion

- Distance to v4.1:
  - **Substantial**. UI baseline is close to v4.0 goals, but v4.1 core data architecture is largely absent.
- Implementation difficulty:
  - **High** (requires storage model, job pipeline, API contract extension, and dimension/fallback governance).
- Priority suggestion:
  - **P0:** `stats_timeseries` schema + cube-generation pipeline + Trends read path switch (saved-cube only)
  - **P1:** filter-consistent Trends, composite dimension support, fallback metadata
  - **P2:** warm cache policy + Top5 fixed ranking trend families + operational hardening

