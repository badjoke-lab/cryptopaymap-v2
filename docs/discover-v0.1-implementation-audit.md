# Discover v0.1 Implementation Audit (post-PR289 / pre-release)

Date: 2026-02-26  
Scope: `/discover` layout + behavior + resilience + API usage audit against the requested v0.1 checklist.

## Checklist (Pass/Fail)

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | Section order is `Hero -> Activity -> Trending -> Stories -> Cities -> Asset Explorer -> Verification Hub` | ✅ Pass | Render order in `DiscoverPage` matches exact sequence: hero section, then top grid (`ActivityFeedSection`, `TrendingCountriesSection`), then `StoriesSection`, `FeaturedCitiesSection`, `AssetExplorerSection`, `VerificationHubSection`.【F:components/discover/DiscoverPage.tsx†L13-L33】 |
| 2 | Mobile ≤767: no horizontal scroll at 380px and 480px | ❌ Fail (380px), ✅ Pass (480px) | Runtime viewport probe on `/discover` reported `docScrollWidth=384` at `innerWidth=380` (overflow), and `docScrollWidth=480` at `innerWidth=480` (no overflow). Likely contributor: negative horizontal margin wrapper used by the Cities carousel container (`-mx-4`).【F:components/discover/sections/FeaturedCitiesSection.tsx†L58-L60】 |
| 3 | Tablet 768–1023: no overflow | ✅ Pass | Runtime viewport probe at 800px reported `docScrollWidth=800`, indicating no horizontal overflow under tablet width. Layout breakpoint logic is explicitly defined for mobile/tablet/pc. 【F:components/discover/sections/shared.tsx†L187-L205】 |
| 4 | PC ≥1024: two-column top (`Activity + Trending`) | ✅ Pass | Top block uses `lg:grid-cols-[2fr_1fr]` and places Activity + Trending in that grid only. 【F:components/discover/DiscoverPage.tsx†L24-L27】 |
| 5 | Activity tabs (4): Added / Owner / Community / Promoted | ❌ Fail (label mismatch) | 4 tabs and per-tab fetch/state are implemented, but first tab label is `Just Added` instead of `Added`. Fetch URL is tab-specific (`/api/discover/activity?tab=...`) and state is keyed by active tab. 【F:components/discover/sections/ActivityFeedSection.tsx†L20-L25】【F:components/discover/sections/ActivityFeedSection.tsx†L35-L57】 |
| 6 | Trending Countries: Top5 and row links to `/map?country=` | ✅ Pass | Items are sliced to 5 and each row links to `/map?country=<countryCode>`. 【F:components/discover/sections/TrendingCountriesSection.tsx†L24-L25】【F:components/discover/sections/TrendingCountriesSection.tsx†L66-L68】 |
| 7 | Stories tabs Auto / Monthly | ❌ Fail (label mismatch) | Tab behavior exists, but labels are `Auto Stories` and `Monthly Report`, not exact `Auto` / `Monthly`. 【F:components/discover/sections/StoriesSection.tsx†L185-L187】 |
| 8 | Stories cards open modal (not new page), modal closes by ESC / X / backdrop | ✅ Pass | Story cards are buttons that set local modal state; modal is an in-page dialog. ESC listener, close `×` button, and backdrop click all close modal. 【F:components/discover/sections/StoriesSection.tsx†L55-L62】【F:components/discover/sections/StoriesSection.tsx†L197-L207】【F:components/discover/sections/StoriesSection.tsx†L256-L268】 |
| 9 | Cities: Top6, mobile carousel 1.2, link `/map?country=&city=` | ✅ Pass | Data is capped to 6; mobile cards use `min-w-[83.333%]` (1.2-card peek); links include `country` + `city` params. 【F:components/discover/sections/FeaturedCitiesSection.tsx†L24-L25】【F:components/discover/sections/FeaturedCitiesSection.tsx†L59-L67】 |
| 10 | Asset Explorer: pills + panel; country/category links include asset; recent links `/map?place=` | ✅ Pass | Pill buttons select asset, panel fetches per selected asset, country/category links include `asset`, and recent links go to `place`. 【F:components/discover/sections/AssetExplorerSection.tsx†L108-L121】【F:components/discover/sections/AssetExplorerSection.tsx†L58-L60】【F:components/discover/sections/AssetExplorerSection.tsx†L155-L156】【F:components/discover/sections/AssetExplorerSection.tsx†L169-L170】【F:components/discover/sections/AssetExplorerSection.tsx†L183-L184】 |
| 11 | Verification Hub: 4 items, mobile accordion, semantics not altered | ✅ Pass | Four verification items are defined; desktop renders cards; mobile renders `<details>` accordion. Meaning text remains aligned with verification definitions. 【F:components/discover/sections/VerificationHubSection.tsx†L6-L31】【F:components/discover/sections/VerificationHubSection.tsx†L55-L61】 |
| 12 | Resilience: each section has loading/empty/error + retry, per-section retry behavior | ❌ Fail (Verification Hub exception) | Activity, Trending, Stories, Cities, and Asset Explorer each implement loading/empty/error/retry patterns via `SimpleSkeletonRows`, `SectionEmpty`, `SectionError`, and retry handlers. Verification Hub is static and has no loading/empty/error/retry state. 【F:components/discover/sections/ActivityFeedSection.tsx†L120-L129】【F:components/discover/sections/TrendingCountriesSection.tsx†L51-L60】【F:components/discover/sections/StoriesSection.tsx†L191-L193】【F:components/discover/sections/FeaturedCitiesSection.tsx†L53-L56】【F:components/discover/sections/AssetExplorerSection.tsx†L124-L147】【F:components/discover/sections/VerificationHubSection.tsx†L33-L65】 |
| 13 | `limited=true` shows subtle note/reason (if implemented) | ✅ Pass | Reusable limited note is subtle and collapses reason under `<details>`. Sections wire `limited` and `reason` into this note. 【F:components/discover/sections/shared.tsx†L93-L104】【F:components/discover/sections/ActivityFeedSection.tsx†L155-L158】【F:components/discover/sections/TrendingCountriesSection.tsx†L77-L77】【F:components/discover/sections/StoriesSection.tsx†L223-L223】【F:components/discover/sections/FeaturedCitiesSection.tsx†L84-L84】【F:components/discover/sections/AssetExplorerSection.tsx†L193-L193】 |
| 14 | UI uses `/api/discover/*` endpoints introduced in PR-288 | ✅ Pass | All discover UI fetches target `/api/discover/...`, and route handlers delegate to `discoverHandlers`. 【F:components/discover/sections/ActivityFeedSection.tsx†L56-L57】【F:components/discover/sections/TrendingCountriesSection.tsx†L20-L21】【F:components/discover/sections/StoriesSection.tsx†L94-L95】【F:components/discover/sections/StoriesSection.tsx†L121-L123】【F:components/discover/sections/FeaturedCitiesSection.tsx†L20-L21】【F:components/discover/sections/AssetExplorerSection.tsx†L32-L33】【F:components/discover/sections/AssetExplorerSection.tsx†L58-L59】【F:app/api/discover/activity/route.ts†L5-L7】【F:app/api/discover/trending-countries/route.ts†L5-L7】【F:app/api/discover/stories/auto/route.ts†L5-L7】【F:app/api/discover/stories/monthly/route.ts†L5-L7】【F:app/api/discover/featured-cities/route.ts†L5-L7】【F:app/api/discover/assets/route.ts†L5-L7】【F:app/api/discover/assets/[asset]/route.ts†L5-L8】 |
| 15 | No mock data remains | ✅ Pass | Discover server handlers query DB-backed sources (and monthly markdown content directory for monthly stories) rather than local mock payload fixtures in UI components. 【F:lib/discover/server.ts†L622-L720】【F:lib/discover/server.ts†L594-L613】 |
| 16 | No sponsor/ads wording anywhere | ✅ Pass | Repository search across discover code paths found no sponsor/ads wording in implementation files. (See command log below.) |

## Issues found (with suggested fix summaries)

1. **Mobile horizontal overflow at 380px**  
   - **Where:** Cities section carousel wrapper uses `-mx-4` alongside `px-4` and horizontal scroll container patterns. 【F:components/discover/sections/FeaturedCitiesSection.tsx†L58-L60】  
   - **Impact:** Global page width exceeds viewport on narrow devices (`380px`), violating “no horizontal scroll.”  
   - **Suggested fix (small):** Remove/adjust `-mx-4` at smallest breakpoint (e.g., keep neutral margins on very small screens, or move padding to parent with `overflow-x-hidden` guard).

2. **Activity tab label mismatch**  
   - **Where:** First tab label is `Just Added`. 【F:components/discover/sections/ActivityFeedSection.tsx†L20-L22】  
   - **Impact:** Does not match required copy `Added`.  
   - **Suggested fix (trivial):** Rename label string to `Added`.

3. **Stories tab label mismatch**  
   - **Where:** Labels are `Auto Stories` and `Monthly Report`. 【F:components/discover/sections/StoriesSection.tsx†L185-L187】  
   - **Impact:** Does not match required copy `Auto` and `Monthly`.  
   - **Suggested fix (trivial):** Rename tab labels to exact spec strings.

4. **Resilience rule not met for Verification Hub section**  
   - **Where:** Verification Hub is static content only; no loading/empty/error/retry path. 【F:components/discover/sections/VerificationHubSection.tsx†L33-L65】  
   - **Impact:** Fails strict interpretation of “every section has loading/empty/error UI and retry works per section.”  
   - **Suggested fix:** Either (a) relax spec for static sections, or (b) move verification copy to an API-backed payload and apply standard section state model.

## Ready to announce?

**Verdict: No (not yet).**

Reasons:
- One hard layout regression remains on mobile `380px` horizontal overflow. 【F:components/discover/sections/FeaturedCitiesSection.tsx†L58-L60】
- Two spec copy mismatches in tab labels (`Added`, `Auto`/`Monthly` expected). 【F:components/discover/sections/ActivityFeedSection.tsx†L20-L22】【F:components/discover/sections/StoriesSection.tsx†L185-L187】
- Resilience requirement is not universally met if interpreted literally for all sections (Verification Hub). 【F:components/discover/sections/VerificationHubSection.tsx†L33-L65】

---

## Command log used for this audit

- `rg --files`
- `sed -n '1,320p' components/discover/DiscoverPage.tsx`
- `sed -n '1,360p' components/discover/sections/ActivityFeedSection.tsx`
- `sed -n '1,420p' components/discover/sections/StoriesSection.tsx`
- `sed -n '1,360p' components/discover/sections/TrendingCountriesSection.tsx`
- `sed -n '1,360p' components/discover/sections/FeaturedCitiesSection.tsx`
- `sed -n '1,420p' components/discover/sections/AssetExplorerSection.tsx`
- `sed -n '1,360p' components/discover/sections/VerificationHubSection.tsx`
- `sed -n '1,360p' components/discover/sections/shared.tsx`
- `for f in app/api/discover/...; do sed -n '1,220p' "$f"; done`
- `rg -n "mock|sponsor|ads|advert" components/discover app/api/discover lib/discover docs/discover*`
- Runtime check via Playwright (local `/discover` at 380/480/800/1280 widths) for scroll width + section order probes.
