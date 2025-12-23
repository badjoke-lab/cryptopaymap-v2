# Dev smoke checks

Quick commands to verify API output and database rows locally.

```bash
# List route should include Lightning for antarctica-owner-1
curl -s "http://localhost:3000/api/places?country=AQ" | jq '.[] | select(.id=="antarctica-owner-1") | .accepted'

# Detail route should mirror accepted assets
curl -s "http://localhost:3000/api/places/antarctica-owner-1" | jq '.accepted'

# Simple DB smoke-check (requires DATABASE_URL in .env.local or environment)
npm run db:check -- antarctica-owner-1
```

Expected highlights:
- List API includes `Lightning` plus on-chain assets such as `BTC`, `ETH`, and `USDT` for `antarctica-owner-1`.
- Detail API stays reachable (200) and reports the same accepted set including `Lightning`.
- DB smoke-check prints the place row, payment_accepts entries, and any verification record for the requested id.
