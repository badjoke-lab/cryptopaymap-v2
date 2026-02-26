# Discover audit mode (fixture data)

This project supports a deterministic fixture mode for `/discover` and `/api/discover/*` so audits can run without a database.

## Enable fixture mode

Fixture mode is **opt-in** and **off by default**.

Set this environment variable before starting Next.js:

```bash
NEXT_PUBLIC_DISCOVER_FIXTURE=1
```

Examples:

```bash
NEXT_PUBLIC_DISCOVER_FIXTURE=1 npm run dev
```

```bash
NEXT_PUBLIC_DISCOVER_FIXTURE=1 npm run build && NEXT_PUBLIC_DISCOVER_FIXTURE=1 npm start
```

When enabled:
- API endpoints under `/api/discover/*` return deterministic fixture payloads.
- `/discover` shows a subtle `Fixture data` badge.

## Endpoints covered

- `/api/discover/activity`
- `/api/discover/trending-countries`
- `/api/discover/stories/auto`
- `/api/discover/stories/monthly`
- `/api/discover/featured-cities`
- `/api/discover/assets`
- `/api/discover/assets/[asset]`

All fixture responses keep the standard envelope:

```json
{ "ok": true, "limited": false, "data": "...", "lastUpdatedISO": "..." }
```

## Quick responsive verification (380 / 480 / 768 / 1024+)

1. Run with fixture mode enabled.
2. Open `/discover` in browser devtools responsive mode.
3. Verify these widths:
   - `380px`
   - `480px`
   - `768px`
   - `1024px` (or larger)
4. Check that:
   - content renders in all Discover sections using fixture data,
   - section order/layout is unchanged,
   - Asset Explorer "Recent Items" links include both `place` and `asset` query params when an asset is selected.
