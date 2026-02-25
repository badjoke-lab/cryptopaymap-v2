# Discover roadmap notes

## PR-1 (UI shell)

- `/discover` now renders the v0.1 UI shell using local mock datasets only.
- All section-level loading, empty, and error states are handled in UI components.
- Stories open in an in-page modal and do not use route pages.

## Next step (PR-2)

- Wire Discover sections to dedicated API endpoints and replace mock payloads.

## PR-2 (Discover APIs v0.1)

New backend endpoints (same-origin):

- `GET /api/discover/activity?tab=added|owner|community|promoted&limit=8`
- `GET /api/discover/trending-countries?window=30d`
- `GET /api/discover/stories/auto`
- `GET /api/discover/stories/monthly`
- `GET /api/discover/featured-cities`
- `GET /api/discover/assets`
- `GET /api/discover/assets/{asset}`

All endpoints return a common envelope:

```json
{
  "ok": true,
  "limited": false,
  "reason": "optional",
  "data": {},
  "lastUpdatedISO": "2026-01-01T00:00:00.000Z"
}
```

### Quick curl checks

```bash
curl -s "http://localhost:3000/api/discover/activity?tab=added&limit=8"
curl -s "http://localhost:3000/api/discover/activity?tab=owner"
curl -s "http://localhost:3000/api/discover/activity?tab=community"
curl -s "http://localhost:3000/api/discover/activity?tab=promoted"
curl -s "http://localhost:3000/api/discover/trending-countries?window=30d"
curl -s "http://localhost:3000/api/discover/stories/auto"
curl -s "http://localhost:3000/api/discover/stories/monthly"
curl -s "http://localhost:3000/api/discover/featured-cities"
curl -s "http://localhost:3000/api/discover/assets"
curl -s "http://localhost:3000/api/discover/assets/BTC"
```

### Example payload snippets

```json
{
  "ok": true,
  "limited": false,
  "data": [
    {
      "placeId": "abc123",
      "name": "Cafe Example",
      "city": "Lisbon",
      "country": "PT",
      "verificationLevel": "owner",
      "assets": ["BTC", "USDT"],
      "timeLabelISO": "2026-02-01T12:30:00.000Z",
      "eventType": "promote"
    }
  ],
  "lastUpdatedISO": "2026-02-01T13:00:00.000Z"
}
```

```json
{
  "ok": true,
  "limited": true,
  "reason": "monthly content directory not found",
  "data": {
    "hasContent": false,
    "items": []
  },
  "lastUpdatedISO": "2026-02-01T13:00:00.000Z"
}
```
