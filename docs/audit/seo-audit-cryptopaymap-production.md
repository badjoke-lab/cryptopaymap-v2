# Full SEO Audit – CryptoPayMap (Production)

- Target: `https://cryptopaymap.com` (resolved to `https://www.cryptopaymap.com`)
- Audit method: repository source inspection + live rendered output/headers via Playwright request/page APIs.
- Audit date: 2026-02-23 (UTC).

## Evidence commands used

```bash
# Source inspection
rg -n "metadata|canonical|robots|sitemap|alternates|openGraph|twitter|viewport|charset|json-ld|application/ld\+json|noindex|hreflang|generateStaticParams|dynamic" app next.config.js middleware.ts public/robots.txt public/sitemap.xml
sed -n '1,220p' app/layout.tsx
sed -n '1,220p' app/(map)/page.tsx
sed -n '1,220p' app/(map)/map/page.tsx
sed -n '1,220p' app/(site)/stats/page.tsx
sed -n '1,220p' app/(site)/discover/page.tsx
sed -n '1,240p' components/GlobalHeader.tsx
sed -n '1,220p' components/SiteFooter.tsx
sed -n '1,200p' next.config.js
sed -n '1,200p' public/robots.txt
sed -n '1,220p' public/sitemap.xml
find app -type f | rg '\\[.*\\]/page\\.tsx|/place|/places'

# Production redirects/status
# (Playwright request context with max_redirects=0)
# http://cryptopaymap.com/ => 308 -> https://cryptopaymap.com/
# https://cryptopaymap.com/ => 307 -> https://www.cryptopaymap.com/
# https://www.cryptopaymap.com/ => 200
# https://www.cryptopaymap.com/map/ => 308 -> /map

# Production rendered tags/content
# (Playwright page.goto + DOM extraction)
# Verified title/canonical/meta/h1/og/twitter/charset/viewport/hreflang for: /, /map, /stats, /discover, /about, /404 test
```

---

## 1) Technical SEO

| Item | Status | Where / How | Correct? | Risk |
|---|---|---|---|---|
| `robots.txt` existence | PASS | Physical file in `public/robots.txt`; served at `/robots.txt` in prod (200). | Exists and is reachable. | Low |
| `robots.txt` correctness | PARTIAL | Allows all, disallows `/api/`, `/_next/`, `/internal`; sitemap declared as `https://www.cryptopaymap.com/sitemap.xml`. | Mostly correct; broad `Disallow: /_next/` is common but not mandatory. No crawl-delay or bot-specific directives (not required). | Low |
| `sitemap.xml` existence | PASS | Static file `public/sitemap.xml`; served at `/sitemap.xml` (200). | Exists and reachable. | Low |
| `sitemap.xml` correctness | PARTIAL | Contains key top-level URLs (`/`, `/discover`, `/submit`, `/stats`, `/about`, `/donate`, `/map`). | Valid for current top-level pages, but static/manual dates (`2026-02-02`) and no dynamic place URL coverage. | Medium |
| Sitemap index (`sitemap_index.xml`) | PASS (N/A) | Only one sitemap exists. | Not required with a single sitemap. | Low |
| HTTP status coverage (200/301/302/404) | PARTIAL | 200: normal pages; 404 verified on fake URL; redirects are 307/308 (not 301/302). | Functionally fine; permanent canonicalization ideally uses 301/308 consistently. 302 not needed. | Low |
| Canonical tag – homepage | PASS | Metadata canonical `'/'` in `app/(map)/page.tsx`; rendered canonical `https://www.cryptopaymap.com/`. | Correct. | Low |
| Canonical tag – `/map` | PASS | Metadata canonical `'/map'` in `app/(map)/map/page.tsx`; rendered canonical absolute URL. | Correct. | Low |
| Canonical tag – `/stats` | PASS | Metadata canonical `'/stats'` in `app/(site)/stats/page.tsx`; rendered canonical absolute URL. | Correct. | Low |
| Canonical tag – dynamic place pages | FAIL (not implemented) | No user-facing dynamic place page route in `app/**/[id]/page.tsx` for places. | No indexable place-detail page/canonical strategy exists. | Medium |
| Trailing slash consistency | PASS | `/map/` and `/stats/` return 308 to slashless URLs; canonical also slashless. | Consistent slashless policy. | Low |
| `www` vs non-`www` redirect | PASS | `https://cryptopaymap.com/*` returns 307 to `https://www.cryptopaymap.com/*`. | Canonical host enforced. | Low |
| HTTP → HTTPS redirect | PASS | `http://cryptopaymap.com/` returns 308 to `https://cryptopaymap.com/` then to `www`. | Correct transport upgrade. | Low |
| Meta charset | PASS | Rendered `<meta charset="utf-8">` present. | Correct. | Low |
| Viewport tag | PASS | Rendered viewport `width=device-width, initial-scale=1`. | Correct. | Low |
| `X-Robots-Tag` headers | PARTIAL | No `x-robots-tag` seen on sampled HTML, robots, sitemap, or 404 responses. | Not required for standard pages; but missing as defense-in-depth for API/non-HTML endpoints. | Low |
| `hreflang` | FAIL (not implemented) | No `link rel="alternate" hreflang` tags found. | Missing multi-language targeting (acceptable only if single-language intent). | Low |
| Pagination handling | PASS (N/A) | No crawlable paginated list pages observed (map/stats are interactive client UIs, no `?page=` archive). | Not currently applicable. | Low |

### Technical notes
- Internal/private sections are protected by middleware for `/internal` and `/api/internal`, reducing accidental public indexing exposure of admin surfaces.
- API routes are disallowed in robots, but robots is advisory (security still relies on auth, which exists for internal API scope).

---

## 2) On-Page SEO

| Item | Status | Findings | Risk |
|---|---|---|---|
| Unique `<title>` per page | PARTIAL | `/` and `/map` both render `Map | CryptoPayMap` (intentional duplicate for map-home model). Other checked pages are unique. | Medium |
| Title length (50–60 chars) | PARTIAL | Many titles are short (`Map | CryptoPayMap`, `Stats | CryptoPayMap`, etc.) and below ideal range. | Low |
| Meta description existence | PASS | Present on sampled core pages. | Low |
| Meta description uniqueness | PASS | Home/map/stats/discover/about descriptions differ in sampled pages. | Low |
| Meta description length (140–160) | PARTIAL | Several are short/long outside ideal window; not missing. | Low |
| H1 presence and uniqueness | FAIL | Homepage (`/`) and `/map` have **no H1** in rendered output; `/stats`, `/discover`, `/about` do have one. | High |
| Heading hierarchy (H1→H2→H3) | PARTIAL | Content pages look sane; map pages have no headings. | Medium |
| Image alt attributes | PARTIAL | Key UI images use alt (logo, place photos). No global proof that every image has meaningful alt; some decorative images may be okay but should be audited component-by-component. | Low |
| Open Graph tags | PASS | `og:title`, `og:description`, `og:image`, `og:url` exist via metadata defaults/page overrides. | Low |
| Twitter card tags | PASS | `twitter:card` + title/description/images present via metadata. | Low |
| Favicon presence | PASS | `favicon.ico`, png variants, apple touch icon, webmanifest configured in root metadata/public. | Low |
| Structured data JSON-LD | PARTIAL | `WebSite` + `Organization` graph exists in root layout script. No `BreadcrumbList` or `LocalBusiness` per place (no place pages). | Medium |
| Duplicate title issues | PARTIAL | Duplicate between `/` and `/map`. | Medium |
| Duplicate meta description issues | FAIL | `/` and `/map` map-like intent can still compete; rendered descriptions differ, but near-duplicate topic targeting remains cannibalization risk due same title and similar page purpose. | Medium |

---

## 3) Performance & Core Web Vitals (Static Inspection)

| Check | Status | Findings | Risk |
|---|---|---|---|
| Next.js configuration | PARTIAL | Basic config only; broad remote image pattern `hostname: '**'` and custom webpack asset rule for images. | Medium |
| Image optimization usage | PARTIAL | `next/image` used in header logo; map/cards/drawers mostly use raw `<img>` tags. | Medium |
| `next/image` coverage | PARTIAL | Not consistently used for large content images from place media. | Medium |
| Script loading strategy | PASS | GA script loaded `afterInteractive`; JSON-LD inserted `beforeInteractive` (small). | Low |
| Font loading strategy | FAIL | No `next/font` usage found; relying on default/system stack only (acceptable UX, but no explicit optimization strategy). | Low |
| Potential render-blocking resources | PARTIAL | Leaflet CSS imported in client map stack; map-heavy entry can be expensive. | Medium |
| Bundle size risks | PARTIAL | `MapClient` and `StatsPageClient` are large client components with extensive logic/state. | High |
| Excessive client-side rendering | PARTIAL | Homepage is client-heavy map with little SSR semantic content. Stats also hydrates significant interactive UI. | High |

### Potential CWV risks
- **LCP risk (Medium/High):** map shell and JS-heavy hydration on homepage.
- **CLS risk (Medium):** map/drawer UI and async data panels can shift if dimensions are not fully reserved.
- **TTFB risk (Low/Medium):** mostly platform/runtime dependent; no obvious server bottleneck from source alone for static shells.

---

## 4) Internal Linking Structure

| Check | Status | Findings | Risk |
|---|---|---|---|
| Homepage links to Map/Stats/Discover | PASS | Global header includes crawlable links to `/map`, `/stats`, `/discover`. | Low |
| Place pages internally linked | FAIL (N/A product gap) | No crawlable place-detail pages exist; map selection is JS state/query-driven. | Medium |
| Orphan pages | PARTIAL | Core pages are navigable via header/footer/sitemap; deeper submit confirmation routes may rely mostly on flow navigation. | Low |
| Breadcrumb implementation | FAIL | No breadcrumb component/markup observed; no Breadcrumb JSON-LD either. | Low |
| Footer links crawlable | PASS | Footer has normal links for Contact/Report/Privacy/Disclaimer. | Low |
| Anchor text descriptive | PASS | Link labels are clear and descriptive. | Low |

---

## 5) Crawl Depth & Indexability

| Check | Status | Findings | Risk |
|---|---|---|---|
| Dynamic routes statically generated | PARTIAL | No public dynamic content routes for places; public pages mostly static shells + client fetching. | Medium |
| Accidental `noindex` | PASS | No noindex in page metadata for public site routes sampled. | Low |
| API routes exposed to indexing | PARTIAL | `/api/` disallowed in robots; still technically publicly reachable unless separately restricted (except `/api/internal/*` auth-protected). | Medium |
| Discoverable navigation | PASS | Header nav is clear and consistent. | Low |
| Internal search discoverability | FAIL | No dedicated crawlable search results pages; map filter/search appears client-only. | Low |

---

## 6) Content-Level SEO

| Area | Status | Findings | Risk |
|---|---|---|---|
| Homepage text sufficiency | FAIL | Homepage is primarily map UI; rendered H1 absent and very limited crawlable explanatory text. | High |
| Stats page text sufficiency | PARTIAL | Has H1 and section labels, but content is mostly UI/data widgets and may be thin for query intent variants. | Medium |
| Discover page text sufficiency | PARTIAL | Has H1 and some explanatory copy, but currently “coming soon” and relatively thin. | Medium |
| Keyword targeting | PARTIAL | Metadata/copy target “crypto-friendly places / accept cryptocurrency” reasonably, but no strong dedicated landing pages per intent cluster. | Medium |
| Thin-content risk | PARTIAL | Highest risk on map homepage and discover placeholder sections. | High |
| Duplicate-content risk map vs stats | PARTIAL | Different purpose, but homepage and `/map` are near-duplicates by UX/title intent. | Medium |

---

## 7) Security & Trust Signals

| Check | Status | Findings | Risk |
|---|---|---|---|
| HTTPS valid | PASS | HTTPS pages load successfully in production checks. | Low |
| HSTS | PASS | `strict-transport-security: max-age=63072000` observed on canonical responses. | Low |
| Privacy policy link | PASS | Footer links to `about#privacy`. | Low |
| Terms link | FAIL | No explicit Terms page/link found. | Medium |
| Contact link | PASS | Footer links to `about#contact`. | Low |
| Structured organization info | PASS | JSON-LD Organization present in root layout. | Low |

---

## 8) Executive Summary + Priorities

## Executive Summary (Score: **68/100**)

Current implementation gets the fundamentals right (canonical host redirects, sitemap/robots presence, metadata/OG/twitter baseline, HTTPS + HSTS).
The main weaknesses are **semantic indexability and content depth** on the homepage/map experience, plus some structural SEO gaps (no place-detail indexable pages, no breadcrumb structured data, duplicated map/home title intent).

### Critical issues (must fix now)
1. **Homepage and `/map` missing H1 + weak crawlable text content** (high impact on topical clarity and relevance).
2. **No indexable place-detail pages** (limits long-tail local SEO potential severely).
3. **Homepage and `/map` duplicate title intent (`Map | CryptoPayMap`)** causing cannibalization/confusion.

### Medium-priority improvements
1. Expand structured data: add `BreadcrumbList` where applicable and plan `LocalBusiness` on place pages once they exist.
2. Improve content depth for discover/stats with intent-targeted explanatory sections.
3. Improve image optimization consistency (`next/image` or equivalent strategy for major media blocks).
4. Harden indexation controls for non-HTML endpoints using `X-Robots-Tag` where sensible.

### Low-priority enhancements
1. Add hreflang only if multilingual strategy is planned.
2. Add explicit Terms page/link.
3. Tune title/description lengths closer to ideal SERP ranges.

### Already correctly implemented
- Robots + sitemap are present and reachable.
- Canonical tags and OG/Twitter metadata are broadly in place.
- HTTPS enforcement and `www` canonicalization are active.
- HSTS is enabled.
- Global navigation and footer links are crawlable.
- Organization/WebSite JSON-LD exists.

