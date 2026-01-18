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

## CI setup (DATABASE_URL secret)

Smoke checks in GitHub Actions read `DATABASE_URL` from repository secrets.

1. Open **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name it `DATABASE_URL` and paste a connection string for your read-only DB user.

Recommendations:
- Use a read-only database user to avoid accidental writes.
- Point to a stable environment (staging/replica) that matches production schema.
- Keep the connection string minimal (host, db, user, password, sslmode as needed).

Common failures:
- **Missing env**: smoke job logs show `DATABASE_URL` is undefined. Add the secret in GitHub and re-run.
- **Connection refused**: check firewall/IP allowlist, SSL requirements, and that the host is reachable from GitHub Actions.
- **Schema mismatch**: look for migration-related errors in the smoke job output; update the DB or adjust the API expectations.

Troubleshooting:
- GitHub Actions logs → **Smoke** job → **Run smoke** step.
- For local repro, export `DATABASE_URL` before running `npm run smoke`.

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
