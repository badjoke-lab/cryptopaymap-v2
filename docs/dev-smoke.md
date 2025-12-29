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
- Accepted assets are normalized via the shared helper used by both routes, so the sets match even when falling back to JSON data.
- DB smoke-check prints the place row, payment_accepts entries, and any verification record for the requested id.

## Accepted assets ordering (DB-backed)

Run dev server, then:

BASE="http://localhost:3000"
for id in antarctica-owner-1 antarctica-community-1 antarctica-directory-1 antarctica-unverified-1; do
  echo "== $id =="
  curl -s "$BASE/api/places/$id" | python3 -c 'import json,sys; a=json.load(sys.stdin); print(a.get("verification"), a.get("accepted"))'
done

Expected:
- owner       ['BTC','Lightning','ETH','USDT']
- community   ['BTC','ETH']
- directory   ['BTC']
- unverified  ['BTC']

