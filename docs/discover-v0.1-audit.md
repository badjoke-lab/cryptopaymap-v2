# Discover v0.1 Readiness Audit (Report-First)

Date: 2026-02-25  
Scope: current repository implementation status for `/discover` readiness (no full UI implementation in this task).

---

## 1) Summary of current state

## What already exists
- `/discover` route exists, but is currently a static placeholder page with “coming soon” copy and CTA buttons (currently `/map` and `/submit`, not `/stats`).
- `/map` is productionized and data-backed through same-origin APIs:
  - `GET /api/places`
  - `GET /api/places/[id]`
  - `GET /api/filters/meta`
  - Query-param selection exists via `?place=<id>` (and legacy `?select=` alias).
- `/stats` is productionized and data-backed through same-origin APIs:
  - `GET /api/stats`
  - `GET /api/stats/trends?range=...`
  - `GET /api/filters/meta`
- DB-oriented infra exists for `places`, `verifications`, `payment_accepts`, `history`, plus compatibility/fallback logic and JSON fallback mode.
- Existing UX patterns already in codebase: loading/error/limited states, badges, cards, pills/chips style, responsive map drawers.

## What is missing for Discover v0.1
- No Discover sections are implemented yet (Hero structure is partial only).
- No Discover-specific API endpoints exist yet (activity feed, trending countries growth, featured cities summary, asset explorer, stories, verification hub).
- No stories content path currently exists (`content/monthly/...` absent).
- No reusable app-level tabs/modal primitives are present in current component inventory (Discover will likely need lightweight local section components).

## Net readiness
- **Data/infra readiness:** Partial to strong.
- **Discover page readiness:** Minimal placeholder only.
- **Implementation risk:** Moderate, mostly around temporal analytics semantics and “promoted” definition consistency.

---

## 2) Checklist Audit (A–E)

## A) Routing / pages

### `/discover`
- Exists at `app/(site)/discover/page.tsx`.
- Current content: static heading + “Directory highlights (coming soon)” + CTA links.
- Not yet Discover v0.1 sectionized.

### `/map`
- Implemented at `app/(map)/map/page.tsx` with `MapClient`.
- `MapClient` fetches:
  - `/api/filters/meta` (filters metadata)
  - `/api/places?...` (map population, bbox + filters)
  - `/api/places/:id` (detail enrichment when selected summary lacks drawer fields)
- Selection model:
  - URL query `place` (and legacy `select`) controls selected marker/drawer.
  - On selection, URL is synced with `?place=<id>`.
  - If selected id disappears from current filtered map result, selection is cleared and URL normalized.

### `/stats`
- Implemented at `app/(site)/stats/page.tsx` + client page.
- Client loads:
  - `/api/stats` for snapshot/rankings/matrix
  - `/api/stats/trends` for time-series
  - `/api/filters/meta` for filters

### Discover-like/feed-like components
- No existing generic “discover feed” component.
- Closest reusable patterns are in stats visual blocks and map list/card patterns.

---

## B) API / data loading

## Existing relevant route handlers

### Places + filters
- `GET /api/places`
  - Supports: `bbox`, `limit`, `offset`, `mode=all`, `category`, `country`, `city`, `verification`, `accepted`/`payment`/`chain`, `q`.
  - DB-first with JSON fallback.
  - Returns array of place summaries with “summary-plus” fields (address/about_short/paymentNote/amenities/contact/coverImage).
  - Sorting: prefers `places.updated_at DESC` when column exists.
- `GET /api/places/[id]` and `GET /api/places/by-id?id=...`
  - Return full place detail via `getPlaceDetail`.
- `GET /api/filters/meta`
  - Returns `{ categories, chains, countries, cities }` with DB-first + JSON fallback.

### Stats
- `GET /api/stats`
  - Returns totals, verification breakdown, top assets/chains, category/country/city rankings, acceptance matrix, and acceptance coverage meta.
  - Supports filters: `country/city/category/accepted/verification/promoted/source`.
  - “promoted” filter is only applied if `places.promoted` column exists.
- `GET /api/stats/trends?range=24h|7d|30d|all`
  - Uses `history` table actions `approve`/`promote` to build cumulative deltas.
  - Enriches verification and accepting-any from current `verifications` and `payment_accepts` tables.

### Internal moderation/history (useful signal source)
- `GET /api/internal/submissions/[id]/history`
  - reads `public.history` entries for submission timeline.
- `POST /api/internal/submissions/[id]/promote`
  - Calls `promoteSubmission` which writes to places/verifications/payment_accepts/media and records history action `promote`.

## Discover section data feasibility (current repo)

### 1) Hero
- Data need: none required (static CTA).
- Ready now.

### 2) Activity Feed tabs

- **Just Added**
  - Candidate source A: `places.created_at` if present (not currently used in API code).
  - Candidate source B (more consistent with current trends): `history` first publish event from actions (`approve`,`promote`).
  - Recommendation: use history-based first publication for consistency with `/api/stats/trends`.

- **Owner Verified / Community Verified**
  - Source: `verifications` table (`level` preferred; fallback `status`) + timestamp columns (`last_verified` / `updated_at` if available).
  - Current code already has capability checks for columns.

- **Promoted**
  - Current strongest source: `history.action='promote'`.
  - Secondary source: `submissions.promoted_at` (if present).
  - `places.promoted` is optional and not guaranteed; current stats treats it as optional filter only.

### 3) Trending Countries (Top 5 by 30d growth)
- Feasible using `history` over last 30 days grouped by country by joining `history.place_id -> places.id`.
- If `history` is sparse/missing, fallback strategy needed (e.g., compare `places.created_at` windows if available, else empty state).

### 4) Stories
- **Auto Stories (template-based, no AI):** feasible by combining existing metrics endpoints and deterministic templating.
- **Monthly Report:** currently no content directory exists; introduce file-based convention such as `content/monthly/YYYY-MM.md`.

### 5) Featured Crypto Cities (Top 6)
- Feasible from existing data:
  - city totals from places
  - top category per city
  - top assets per city from payment_accepts
  - verification composition from verifications

### 6) Asset Explorer
- Feasible from `payment_accepts` + places/verifications:
  - top assets list
  - per asset top countries/categories
  - recent places for selected asset

### 7) Verification Hub
- Feasible mostly from existing docs + stats/verifications counts.
- Needs product copy/IA decisions for 4 cards vs accordion behavior.

## History table existence and action shape
- Code ensures `history` table at runtime (`ensureHistoryTable`) with columns:
  - `id`, `created_at`, `actor`, `action`, `submission_id`, `place_id`, `meta`.
- Trends endpoint depends on history action values `approve` and `promote`.
- Important: docs contain legacy/alternate history schema descriptions in some places; implementation relies on moderation-action history schema above.

---

## C) DB / schema verification (repo-level)

## Observed schema sources
- `db/schema.prisma` is currently a placeholder (not authoritative).
- Effective schema contracts are encoded in:
  - SQL compatibility migrations (`migrations/*.sql`)
  - route-level column existence checks (`information_schema`) and runtime compatibility logic.

## Relevant tables/columns used or expected for Discover

### `places`
- definitely used: `id`, `name`, `category`, `country`, `city`, `lat`, `lng`.
- conditionally used if present:
  - `address`, `about`, `amenities`, `payment_note`, `updated_at`, `promoted`, `source`, `hours`, `submitter_name`.
- likely available but not guaranteed in runtime schema:
  - `created_at` (in docs/migrations context, not consistently used by API code).

### `verifications`
- used columns: `place_id`, `level` or fallback `status`.
- optional timestamps: `last_checked`, `last_verified`, `updated_at` (compat migration adds some).

### `payment_accepts`
- used columns: `place_id`, `asset`, `chain`, optional `is_preferred`.
- powers accepted/chains ranking/matrix and Discover asset/city computations.

### `history`
- current implementation schema: moderation actions + timestamps (`action`, `created_at`, `place_id`, etc.).
- enables trend and activity timeline computation.

### submissions/promote fields
- optional columns in `submissions`: `published_place_id`, `linked_place_id`, `promoted_at` are used by promote logic when present.

## Missing/uncertain schema points for Discover (explicit)
- No guaranteed, normalized “promoted flag” on `places` across environments.
- No guaranteed dedicated discover/story tables.
- No guaranteed monthly markdown storage path.
- No guaranteed `places.created_at` usage in existing API contracts (even if column might exist).

## Minimal additions (proposal only, no migrations here)
1. Add read-only Discover API routes first; avoid schema migration in v0.1 unless blocked.
2. Prefer history-driven temporal logic over adding new timestamp columns.
3. If monthly reports are required in v0.1, add only content path convention (`content/monthly/*.md`) without DB change.
4. If promoted UX strictly requires a boolean, consider materializing from history in query/view rather than schema mutation.

---

## D) UI / components inventory

## Reusable existing pieces
- Section/card wrappers: existing Tailwind card blocks used in stats/discover placeholder/internal pages.
- Error blocks:
  - `components/map/MapFetchStatus.tsx` (map-specific retry banner)
  - `components/internal/ErrorBox.tsx` (generic-ish error panel style)
- Badges/chips:
  - `components/internal/StatusBadge.tsx`
  - chip/pill styles in map card and place details.
- Data viz:
  - `components/stats/VerificationDonut.tsx`
- Pagination (if needed for feed):
  - `components/internal/Pagination.tsx`

## Missing primitives for Discover
- No shared Tabs component.
- No shared Modal component.
- No shared Skeleton component library.
- No shared Carousel primitive (mobile carousel behavior would need custom implementation or CSS scroll-snap pattern).

## Responsive/breakpoint guidance
- Use `docs/ui.md` breakpoints:
  - Mobile ≤ 767
  - Tablet 768–1023
  - PC ≥ 1024
- Existing map UI demonstrates mobile/desktop split and explicit loading/error notices.

---

## E) Gaps + concrete implementation plan

## Section-by-section readiness matrix

| Discover section | Status | Existing data/API support | Main gap |
|---|---|---|---|
| Hero | Partial | `/discover` page exists with CTA + metadata | Update CTA targets + final copy/structure |
| Activity Feed | Partial | `history`, `verifications`, submissions promote flow exist | No public feed endpoint; promoted semantics must be fixed |
| Trending Countries | Partial | `history` + `places.country` can compute 30d growth | No endpoint/query yet; fallback when history sparse |
| Stories (Auto/Monthly) | Missing | stats data sources exist | No templates, no monthly markdown path, no modal UI |
| Featured Crypto Cities | Partial | stats/place/payment/verifications can compute | No endpoint and no discover card UI |
| Asset Explorer | Partial | `/api/stats` already returns top_assets + matrix | Need discover-focused endpoint + per-asset recent items |
| Verification Hub | Partial | verification stats + docs exist | No dedicated endpoint/content structure |

## Proposed API endpoints + response shapes (same-origin `app/api/discover/*`)

### 1) `GET /api/discover/activity?tab=just_added|owner_verified|community_verified|promoted&limit=20`
```ts
type DiscoverActivityItem = {
  placeId: string;
  name: string;
  city: string;
  country: string;
  category: string;
  verification: 'owner' | 'community' | 'directory' | 'unverified';
  accepted: string[];
  imageUrl: string | null;
  eventType: 'just_added' | 'owner_verified' | 'community_verified' | 'promoted';
  eventAt: string; // ISO
  source: 'history' | 'verifications' | 'places';
};

type DiscoverActivityResponse = {
  ok: true;
  tab: 'just_added' | 'owner_verified' | 'community_verified' | 'promoted';
  items: DiscoverActivityItem[];
  meta?: { fallbackUsed?: boolean; reason?: string };
};
```
Query strategy:
- just_added: history first publish (`MIN(history.created_at)` for approve/promote) ordered desc.
- owner/community_verified: verifications by level with best-available timestamp.
- promoted: history action=promote ordered desc.

### 2) `GET /api/discover/trending-countries?window=30d&limit=5`
```ts
type TrendingCountry = {
  country: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  growthRate: number | null;
};

type TrendingCountriesResponse = {
  ok: true;
  window: '30d';
  items: TrendingCountry[];
  meta?: { source: 'history' | 'places_created_at'; sparseHistory?: boolean };
};
```
Query strategy:
- preferred: history entries in current and previous 30d windows joined with places.country.
- fallback: places.created_at windows if reliable.

### 3) `GET /api/discover/featured-cities?limit=6`
```ts
type FeaturedCity = {
  city: string;
  country: string;
  totalPlaces: number;
  topCategory: { key: string; count: number } | null;
  topAssets: Array<{ key: string; count: number }>;
  verification: { owner: number; community: number; directory: number; unverified: number };
};

type FeaturedCitiesResponse = { ok: true; items: FeaturedCity[] };
```
Query strategy:
- rank city+country by place count; for top 6, hydrate category/assets/verification breakdown.

### 4) `GET /api/discover/assets`
```ts
type AssetExplorerAsset = {
  asset: string;
  totalPlaces: number;
  topCountries: Array<{ key: string; count: number }>;
  topCategories: Array<{ key: string; count: number }>;
  recentPlaces: Array<{
    placeId: string;
    name: string;
    city: string;
    country: string;
    verification: 'owner' | 'community' | 'directory' | 'unverified';
  }>;
};

type AssetExplorerResponse = {
  ok: true;
  assets: Array<{ key: string; count: number }>; // pills
  defaultAsset: string | null;
  panels: Record<string, AssetExplorerAsset>;
};
```
Query strategy:
- use `payment_accepts.asset` + joins to places/verifications/history timestamps.

### 5) `GET /api/discover/stories`
```ts
type AutoStory = {
  id: string;
  kind: 'auto';
  title: string;
  summary: string;
  bullets: string[];
  metrics: Record<string, number | string>;
};

type MonthlyStory = {
  id: string; // e.g. 2026-02
  kind: 'monthly';
  title: string;
  summary: string;
  markdownPath: string;
};

type DiscoverStoriesResponse = {
  ok: true;
  auto: AutoStory[];
  monthly: MonthlyStory[];
};
```
Query strategy:
- auto stories generated from deterministic templates + stats/trends payloads (no AI).
- monthly list from `content/monthly/*.md` index.

### 6) `GET /api/discover/verification-hub`
```ts
type VerificationHubResponse = {
  ok: true;
  cards: Array<{
    id: 'owner' | 'community' | 'directory' | 'how-it-works';
    title: string;
    description: string;
    count?: number;
    cta?: { label: string; href: string };
  }>;
};
```
Query strategy:
- pull counts from stats verification breakdown + static copy.

## Proposed UI/component file structure (v0.1)

```text
app/(site)/discover/page.tsx
components/discover/DiscoverHero.tsx
components/discover/ActivityFeed.tsx
components/discover/TrendingCountries.tsx
components/discover/StoriesSection.tsx
components/discover/StoryModal.tsx
components/discover/FeaturedCities.tsx
components/discover/AssetExplorer.tsx
components/discover/VerificationHub.tsx
components/discover/DiscoverSection.tsx
components/discover/DiscoverTabs.tsx
components/discover/DiscoverStateBlock.tsx   // loading/empty/error wrapper
app/api/discover/activity/route.ts
app/api/discover/trending-countries/route.ts
app/api/discover/featured-cities/route.ts
app/api/discover/assets/route.ts
app/api/discover/stories/route.ts
app/api/discover/verification-hub/route.ts
content/monthly/README.md  (optional bootstrap)
```

## Edge cases (all sections)
- Loading: show section-level skeletons/placeholders (existing visual language).
- Empty: explicit “No data yet” message + optional CTA (`/map`, `/submit`).
- Error: lightweight retry block per section; avoid failing whole page.
- Limited/data-source fallback mode: surface limited banner similarly to map/stats patterns.

## Suggested PR breakdown
- **PR-A (API foundations):** add discover API handlers + shared query helpers + tests for shapes.
- **PR-B (UI shell):** section layout, tabs, cards, loading/empty/error states, responsive behavior.
- **PR-C (wiring/content):** connect APIs, story templates, monthly markdown ingestion, final CTA/link polish.
- **PR-D (hardening):** perf tuning, cache headers, empty/error analytics, e2e checks.

## Risks / unknowns / required decisions

1. **Canonical source for “just added” and “promoted”.**
   - Decide whether history-first is canonical for Discover (recommended for consistency with trends).

2. **Promoted semantics across environments.**
   - `places.promoted` may not exist; rely on history action promote unless product requires static flag.

3. **Timestamp consistency for verification events.**
   - `last_verified`/`updated_at` availability can differ; define strict priority order for eventAt.

4. **Sparse history in older environments.**
   - Need product-approved fallback behavior (empty vs approximate from places timestamps).

5. **Stories content governance.**
   - Confirm monthly markdown filename convention and release workflow.

6. **Modal and tabs UX standardization.**
   - No shared primitives currently; choose whether to introduce local discover-only primitives first.

7. **Performance and query complexity.**
   - Some sections need multi-join aggregations; may require per-endpoint caching windows.

---

## Final readiness verdict
- Discover v0.1 can be implemented without schema refactor by building discover-specific read APIs on top of existing `places`, `verifications`, `payment_accepts`, and `history` patterns.
- Biggest blocker is not technical absence, but **semantic decisions** (event definitions + fallback policy).
- Recommended next action: approve API semantics decisions, then execute PR-A.
