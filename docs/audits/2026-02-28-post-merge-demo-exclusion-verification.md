# PR-11 / Post-merge verification report: Demo pins exclusion (Stats/Discover) end-to-end

- Date: 2026-02-28
- Scope: Neon DB state (`places.is_demo`), Stats (`/api/stats`), Discover (`/api/discover/*`), Map (`/api/places`)
- Goal: Verify that the 4 Antarctica demo pins remain visible on Map while excluded from Stats/Discover after PR #317 deployment.

## 1. DB確認（実測 or ユーザー実測の引用）

### 1.1 Codex execution capability in this container
- `DATABASE_URL` is not available in this environment, so direct Neon SQL execution was not possible from Codex.
- Therefore DB facts below rely on the user-provided production measurements (stated as confirmed prerequisites).

### 1.2 User-confirmed production DB facts (accepted as source-of-truth)
- `places.is_demo` exists (`has_is_demo = true`).
- `is_demo = true` count is exactly 4.
- IDs match exactly:
  - `antarctica-community-1`
  - `antarctica-directory-1`
  - `antarctica-owner-1`
  - `antarctica-unverified-1`

### 1.3 DB verification verdict
- **PASS (based on user’s production measurements).**

---

## 2. Stats確認（コード根拠 + 実測/推論 + キャッシュ反映）

### 2.1 母集合の除外条件（必須）
Stats aggregation is built from `buildFilteredPlacesCte()`, which composes:
1. map-displayable base (`p.lat IS NOT NULL AND p.lng IS NOT NULL`), and
2. non-demo clause `COALESCE(p.is_demo, false) = false` when column exists.

`buildFilteredPlacesCte()` applies `nonDemoClause` into the `WHERE` of the CTE before all totals/rankings are computed, so exclusion is enforced at source-population level (not post-filtered).

### 2.2 根拠（コード）
- Stats route uses `buildFilteredPlacesCte` and sets `nonDemoClause` as `COALESCE(p.is_demo, false) = false` when `hasIsDemo` is true.
- `hasIsDemo` is resolved by schema check (`hasColumn(route, "places", "is_demo")`).
- Base map-displayable clauses are `lat/lng NOT NULL`.

### 2.3 実測/推論（AQ混入なし）
- In this container, live Neon/API measurement could not be executed because DB credentials are unavailable.
- Given (a) user-confirmed `has_is_demo=true` and demo IDs, and (b) population-level Stats filter above, AQ demo records are excluded from Stats totals/rankings by construction.
- Therefore AQ should not appear in `country_ranking` / “Countries covered” outputs sourced from this endpoint once fresh computation is used.

### 2.4 キャッシュ反映
- Route-level `revalidate = 7200`.
- Response header cache policy: `public, s-maxage=7200, stale-while-revalidate=600`.
- Practical reflection timing after DB change:
  - usually within **up to 2 hours** at edge cache expiry,
  - and potentially serving stale for up to **+10 minutes** while revalidation occurs.

### 2.5 Stats verdict
- **PASS** (code path correctly excludes demos; reflection subject to Stats cache window above).

---

## 3. Discover確認（漏れチェック表 + 実測/推論 + キャッシュ反映）

### 3.1 共通 predicate
`resolveNonDemoPlacesPredicate()` returns `COALESCE(p.is_demo, false) = false` when `places.is_demo` exists, otherwise `TRUE`.

### 3.2 漏れチェック表（主要クエリ）

| Query | places 起点/結合 | non-demo 適用 | Result |
|---|---|---|---|
| `queryActivity` | `INNER JOIN places p ON p.id = le.place_id` | `AND ${nonDemoPlacesPredicate}` in main WHERE | OK |
| `queryFeaturedCities` | CTE `base` starts from `FROM places p` | `AND ${nonDemoPlacesPredicate}` in base CTE WHERE | OK |
| `queryAssets` | `INNER JOIN places p ON p.id = pa.place_id` | `AND ${nonDemoPlacesPredicate}` in WHERE | OK |
| `queryAssetPanel` | countries/categories queries join `places p`; recent5 joins `places p` via history | each query includes `AND ${nonDemoPlacesPredicate}` | OK |
| `queryTrendingCountries` | history scoped CTE then `INNER JOIN places p ON p.id = s.place_id` | `AND ${nonDemoPlacesPredicate}` in WHERE | OK |

### 3.3 実測/推論（AQ混入なし）
- Live Discover endpoint measurement from this container was not possible without production DB connectivity.
- However all major Discover aggregate/query surfaces that join `places p` apply the non-demo predicate centrally and explicitly.
- Therefore AQ demo pins are excluded from Discover country/city/asset/activity/trending outputs when `is_demo=true` is set on those 4 records.

### 3.4 キャッシュ反映
- Discover API routes export `revalidate = 180`.
- Discover server responses use `Cache-Control: public, s-maxage=180, stale-while-revalidate=60`.
- Practical reflection timing after DB change:
  - generally within **~3 minutes**,
  - with possible stale serving during **+60 seconds** SWR period.

### 3.5 Discover verdict
- **PASS** (major query surfaces checked, no omission found).

---

## 4. Map確認（残ることの根拠）

- Map data endpoint (`/api/places`) composes filters using map-displayable conditions (`lat/lng NOT NULL`) and optional user filters.
- No `is_demo` predicate is applied in the places query.
- Therefore `is_demo=true` records remain in Map results, matching the intended spec (“Map keeps demo pins”).

### 4.1 Map verdict
- **PASS** (design intentionally keeps AQ 4 demo pins visible on Map).

---

## 5. 結論（PASS/FAIL）

- **Overall: PASS**
  - DB state requirement: satisfied per user production measurement.
  - Stats: demo exclusion is applied at source CTE population + cache behavior understood.
  - Discover: non-demo predicate is applied across required major queries (including history→places join path).
  - Map: demo pins are intentionally not filtered and remain visible.

---

## 6. 追加TODO（FAIL/グレー時の最短修正案）

Current status is PASS, but for operational confidence and faster incident triage:

1. Add a small secured ops check endpoint or script that returns:
   - `has_is_demo`,
   - demo count,
   - demo IDs,
   - stats total for `is_demo=false` population.
2. Add a periodic smoke check (CI/cron) asserting:
   - Discover trending/featured payloads contain no AQ when AQ is demo-only,
   - Map payload still includes the 4 demo IDs.
3. If cache urgency is needed after DB maintenance, run explicit CDN/app revalidation to avoid waiting full TTL windows.
