# PR-xx audit: published snapshot refresh + guardrails

## A) Map public visibility rule in normal DB mode

`/api/places` DB-mode currently builds its map-eligible WHERE by appending `getMapDisplayableWhereClauses("p")` and optional user filters (`category/country/city/bbox/search/verification/payment`).

Base map-displayable clause:

```sql
p.lat IS NOT NULL
AND p.lng IS NOT NULL
```

Source:
- `getMapDisplayableWhereClauses` returns only `lat/lng IS NOT NULL` in `lib/stats/mapPopulation.ts`.
- `/api/places` appends those clauses directly in DB mode.

## B) Snapshot builder contract + filters

`scripts/build_published_places_snapshot.ts` now:
- probes `public.places` columns (`status`, `is_demo`) first,
- applies hard map-displayable checks: `lat/lng` not null and finite,
- excludes demos when supported: `COALESCE(p.is_demo,false)=false`,
- applies published-only status when supported: `COALESCE(p.status,'published')='published'`,
- preserves the existing summary-plus output shape and writes `meta.last_updated` ISO timestamp.

## C) Guardrail

Added `scripts/verify_published_places_snapshot.ts` and npm script `snapshot:verify`.

The check fails non-zero if snapshot contains:
- `antarctica-*` ids,
- any legacy test ids from `data/places.json`:
  - `cpm:tokyo:owner-cafe-1`
  - `cpm:newyork:community-diner-1`
  - `cpm:paris:directory-bistro-1`
  - `cpm:sydney:unverified-bookstore-1`
  - `cpm:toronto:owner-bakery-1`
- or `country='AQ'`.

## D) Environment limitation for this Codex run

This container does not provide `DATABASE_URL`, and outbound call to `https://cryptopaymap.com` returned a `403 CONNECT tunnel failed` during verification.

Because of that, this run could not query Neon to regenerate `data/fallback/published_places_snapshot.json` with real rows.

Once `DATABASE_URL` is provided, run:

```bash
npm run snapshot:build
npm run snapshot:verify
```

Then capture fallback evidence with:

```bash
PORT=3005 DATA_SOURCE=auto DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid npm run dev
curl -i "http://127.0.0.1:3005/api/places?limit=20"
```

Expected headers in DB-down mode:
- `x-cpm-limited: 1`
- `x-cpm-data-source: json`
- `x-cpm-last-updated: <snapshot meta.last_updated>`
