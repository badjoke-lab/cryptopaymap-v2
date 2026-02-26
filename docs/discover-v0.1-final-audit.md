# Discover v0.1 Final Audit (Post-PR294)

Date: 2026-02-26
Scope: `/discover` route (`app/(site)/discover/page.tsx`) and section components/APIs.
Mode: **Report-only audit** (no refactor).

## Executive Verdict

**READY TO ANNOUNCE? — No (Not Ready for definitive announcement).**

Reason: implementation appears aligned with spec in code for structure, labels, and interaction wiring, but this environment cannot fully produce runtime UI evidence at required breakpoints (browser automation crash + Playwright browser download blocked), and data-backed interactions are not fully exercisable because most discover APIs currently return `ok:false` (`db unavailable`) in this environment.

---

## Pass/Fail Checklist

### 1) No horizontal scroll at 380px and 480px (`docScrollWidth === innerWidth`)
- **Status:** ⚠️ **Blocked / not conclusively verified**
- Notes:
  - Could not run a functioning browser capture/DOM-measure session in this container (Playwright Chromium in browser tool crashes with SIGSEGV; local Playwright browser install blocked with 403).
  - Code review suggests mobile overflow risks were addressed in several sections (`min-w-0`, truncation, wrapped pills, constrained card widths), but this is not equivalent to measured `docScrollWidth` proof.

### 2) Section order
- **Status:** ✅ **Pass (code-confirmed)**
- Required order: Hero -> Activity -> Trending -> Stories -> Cities -> Asset Explorer -> Verification Hub
- Observed in `DiscoverPage` render tree in exactly that sequence.

### 3) Label spec
- **Activity tabs:** ✅ Added / Owner / Community / Promoted
- **Stories tabs:** ✅ Auto / Monthly

### 4) Behavior
- Activity tab fetch by selected tab: ✅ code path uses `/api/discover/activity?tab=${activeTab}&limit=${limit}`.
- Activity card navigation: ✅ cards link to `/map?place=<placeId>`.
- Trending row navigation: ✅ rows link to `/map?country=<countryCode>`.
- Stories modal behavior:
  - Open on story card click: ✅
  - Close on ESC: ✅ window keydown handler
  - Close on X: ✅ close button
  - Close on backdrop: ✅ outer dialog click handler
  - CTA navigation: ✅ auto modal CTA to map link; monthly modal CTA to `/stats`
- Cities card links: ✅ `/map?country=<countryCode>&city=<city>`
- Asset explorer:
  - Pills switch selected asset: ✅ state updates and panel reload per selected asset
  - Panel loads by asset: ✅ `/api/discover/assets/${asset}` fetch
  - Links include params:
    - Countries: ✅ `country` + `asset`
    - Categories: ✅ `category` + `asset`
    - Recent item: ⚠️ place-only link (`/map?place=...`) does not include explicit `asset` param (may still be acceptable depending on strictness of requirement wording)

### 5) Resilience (loading / empty / error + retry per dynamic section)
- **Status:** ✅ **Pass (code-confirmed)**
- Activity, Trending, Stories(auto/monthly), Cities, Asset list/panel each implement loading skeletons, empty states, error component, and retry action.
- Limited note handling exists (`Limited data available right now.`) and is conditionally rendered from envelope `limited` flags. This is subtle and not misleading.

### 6) No sponsor/ads wording anywhere on `/discover`
- **Status:** ✅ **Pass**
- No sponsor/ads/advert wording found in discover page/section code search.

---

## Runtime Evidence Collected

### API behavior in this environment
Most dynamic discover APIs currently return `ok:false` with `reason:"db unavailable"` (except monthly stories endpoint), which prevents end-to-end data-driven card interaction validation here.

Sample responses observed:
- `/api/discover/activity?tab=added&limit=6` -> `{ ok:false, limited:true, reason:"db unavailable", data:[] }`
- `/api/discover/trending-countries?window=30d` -> `{ ok:false, limited:true, reason:"db unavailable", data:[] }`
- `/api/discover/stories/auto` -> `{ ok:false, limited:true, reason:"db unavailable", data:[] }`
- `/api/discover/stories/monthly` -> `{ ok:true, ... }`
- `/api/discover/featured-cities` -> `{ ok:false, limited:true, reason:"db unavailable", data:[] }`
- `/api/discover/assets` -> `{ ok:false, limited:true, reason:"db unavailable", data:[] }`

### Screenshot / artifact status (380/480/768/1024+)
- **Status:** ⚠️ **Unavailable in this run**
- Attempted methods:
  1. MCP browser Playwright script with forwarded port 3000 -> Chromium launch SIGSEGV.
  2. Local Playwright screenshot command -> required browser binary missing.
  3. `npx playwright install chromium` -> blocked by 403 from CDN.

Because of the above, required breakpoint screenshots could not be produced in this specific environment.

---

## Final Recommendation

**Not Ready (for announcement sign-off from this audit run alone).**

To flip this to **Ready** with confidence, run the same audit in an environment where:
1. Browser automation can run and capture viewport evidence at 380/480/768/1024+.
2. Discover APIs are backed by available DB data (or deterministic fixture mode) so interactive navigation checks can be witnessed live.

If those two conditions pass, implementation-level checks in this audit strongly suggest the page is close to launch-ready.
