# Post-merge check report — PR #322 map fallback snapshot behavior

Date: 2026-03-01 (Codex container)
Repo: `/workspace/cryptopaymap-v2`

## Scope
Verify `/api/places` and Map UI behavior for:
1. Normal DB mode
2. Snapshot fallback mode (`json`)
3. Snapshot missing/unavailable mode (`503`)

---

## A) Normal mode (DB available)

### Result: **PARTIAL / BLOCKED IN THIS ENV**

This container does not provide a reachable `DATABASE_URL`, so true DB-backed normal mode could not be executed.

#### Evidence

Command:

```bash
node scripts/db-check.mjs -- antarctica-owner-1
```

Output:

```text
DATABASE_URL is not set. Add it to .env.local or export it before running this script.
```

#### What could not be directly runtime-verified

- A1. `/api/places` returns `x-cpm-limited` not present or not `1` in DB-success path
- A2. `/api/places` returns `x-cpm-data-source` indicating DB mode (not `json`)
- A3. Map UI does not show `Snapshot mode` banner in DB-success path
- A4. Antarctica demo pins still appear in normal mode

#### Code-level evidence for expected normal behavior

- On DB success (`dbPlaces !== null`), API returns DB payload headers: `x-cpm-data-source=db`, `x-cpm-limited=0`. (See API return branches.)
- Map displayable WHERE clause only requires non-null lat/lng and does not exclude `is_demo`, so demo pins are expected in normal map data path.

---

## B) Fallback mode (DB failure -> json snapshot)

### Method used to force DB failure locally

Started Next.js with `DATA_SOURCE=auto` and intentionally invalid `DATABASE_URL`:

```bash
PORT=3005 DATA_SOURCE=auto DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid npm run dev
```

This triggers DB-unavailable handling and fallback to snapshot JSON when snapshot exists.

### B1. API headers + body in fallback

Command:

```bash
curl -sS -D /tmp/b_headers.txt 'http://localhost:3005/api/places?limit=5' -o /tmp/b_body.json
cat /tmp/b_headers.txt
cat /tmp/b_body.json
```

Observed headers:

```http
HTTP/1.1 200 OK
content-type: application/json
x-cpm-data-source: json
x-cpm-last-updated: 2026-03-01T03:34:04.290700Z
x-cpm-limited: 1
```

Observed body shape in this codebase:

- Response is a JSON **array** of places (not `{ meta, places }` envelope).
- `x-cpm-last-updated` header is provided from snapshot `meta.last_updated`.

### B2. Map UI shows snapshot banner + last updated

Verified on `/map` while in fallback mode.

Playwright console evidence:

```text
HAS_SNAPSHOT_MODE True
HAS_LAST_UPDATED True
```

Screenshot artifact:

- `browser:/tmp/codex_browser_invocations/f513d4c14526b8eb/artifacts/artifacts/fallback-map.png`

### B3. Old test 5 places never appear

**FAILED in this environment snapshot content**.

Command:

```bash
node - <<'NODE'
const fs=require('fs');
const oldText=fs.readFileSync('lib/data/places.ts','utf8');
const oldIds=[...oldText.matchAll(/id:\s*"([^"]+)"/g)].map(m=>m[1]);
const data=JSON.parse(fs.readFileSync('/tmp/b_body.json','utf8'));
const ids=new Set((Array.isArray(data)?data:[]).map(p=>p.id));
const overlap=oldIds.filter(id=>ids.has(id));
console.log(JSON.stringify({oldIdsCount:oldIds.length, responseCount:Array.isArray(data)?data.length:null, overlap},null,2));
NODE
```

Output:

```json
{
  "oldIdsCount": 5,
  "responseCount": 5,
  "overlap": [
    "cpm:tokyo:owner-cafe-1",
    "cpm:newyork:community-diner-1",
    "cpm:paris:directory-bistro-1",
    "cpm:sydney:unverified-bookstore-1",
    "cpm:toronto:owner-bakery-1"
  ]
}
```

So fallback snapshot currently contains the exact old 5 fixture places.

### B4. AQ demo pins excluded from snapshot places

Command:

```bash
curl -sS -D /tmp/b_aq_headers.txt 'http://localhost:3005/api/places?country=AQ&limit=20' -o /tmp/b_aq_body.json
cat /tmp/b_aq_headers.txt
cat /tmp/b_aq_body.json
```

Observed:

- Headers show fallback snapshot mode (`x-cpm-data-source: json`, `x-cpm-limited: 1`)
- Body for `country=AQ` is `[]`

Also, snapshot build query explicitly enforces `COALESCE(p.is_demo, false) = false`.

---

## C) Missing snapshot mode

### Method used

Temporarily moved snapshot file out of expected path:

```bash
mv data/fallback/published_places_snapshot.json data/fallback/published_places_snapshot.json.bak
```

(After checks, file was restored.)

### C1. API returns 503 + fallback unavailable error

Command:

```bash
curl -sS -D /tmp/c_headers.txt 'http://localhost:3005/api/places?limit=7&offset=1' -o /tmp/c_body.json
cat /tmp/c_headers.txt
cat /tmp/c_body.json
```

Observed headers/body:

```http
HTTP/1.1 503 Service Unavailable
content-type: application/json
x-cpm-data-source: json
x-cpm-limited: 1
```

```json
{"ok":false,"error":"FALLBACK_SNAPSHOT_UNAVAILABLE","message":"Fallback snapshot data is unavailable or unreadable."}
```

### C2. Map UI error state (no fake data)

Playwright run after snapshot removal produced:

```text
HAS_OLD_TEST_PLACE False
```

Screenshot artifact:

- `browser:/tmp/codex_browser_invocations/03710e69090b1a97/artifacts/artifacts/missing-snapshot-map.png`

Visible UI state includes a retry toast (`Failed to load markers. Retry`) and `Showing 0 places`, with no fixture place entries rendered.

Snapshot restored:

```bash
mv data/fallback/published_places_snapshot.json.bak data/fallback/published_places_snapshot.json
```

---

## File paths and code references relevant to checked behaviors

- API fallback snapshot read path and unavailable error throw/response:
  - `app/api/places/route.ts`
- Data-source headers:
  - `lib/dataSource.ts`
- Map snapshot banner + last updated rendering:
  - `components/status/LimitedModeNotice.tsx`
  - `components/map/MapClient.tsx`
- Snapshot generation exclusion rule for demo places:
  - `scripts/build_published_places_snapshot.ts`
- Old fixture 5-place dataset:
  - `lib/data/places.ts`

---

## DoD checklist

- [ ] A1 Normal mode header `x-cpm-limited` not 1 — **BLOCKED** (no DB in env)
- [ ] A2 Normal mode header `x-cpm-data-source=db` — **BLOCKED** (no DB in env)
- [ ] A3 Normal mode no `Snapshot mode` banner — **BLOCKED** (no DB in env)
- [ ] A4 Normal mode AQ demo pins present — **BLOCKED runtime**, **supported by code path**

- [x] B1 Fallback headers include `x-cpm-limited=1`, `x-cpm-data-source=json`, `x-cpm-last-updated` — **PASS**
- [ ] B1 Response body contains `meta.last_updated` + `places[]` envelope — **FAIL** in runtime (returns array body + header carries timestamp)
- [x] B2 Map shows `Snapshot mode` + `Last updated` — **PASS**
- [ ] B3 Old test 5 places never appear — **FAIL** (they do appear)
- [x] B4 AQ demo pins excluded from snapshot places — **PASS**

- [x] C1 Missing snapshot yields HTTP 503 + `FALLBACK_SNAPSHOT_UNAVAILABLE` — **PASS**
- [x] C2 Map shows clear error state and no fake data — **PASS**

Overall: **NOT FULLY PASSING** against requested acceptance due to blocked normal-mode DB verification in this container plus fallback snapshot content/shape mismatches observed at runtime.
