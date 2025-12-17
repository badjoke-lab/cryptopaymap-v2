# DB Compatibility Check (v3.x schema)

This check ensures the current Neon Postgres/PostGIS instance matches the expected v3.x schema and contains readable data.

## Prerequisites
- `DATABASE_URL` is set (e.g. `postgres://...`)
- Network/firewall access to the database
- Dependencies installed (includes `pg` and `tsx`).

## Run

```bash
pnpm tsx scripts/db_compat_check.ts
# or
npm run db:compat-check
```

## What the script does
- Connects using `DATABASE_URL`
- Verifies PostGIS availability
- Confirms presence of key tables (`places`, `verifications`, `payments`, `payment_accepts`, `socials`, `media`, `categories`, `history`)
- Checks critical columns on `places` and `verifications`
- Performs data sanity checks (row counts, null counts, sample rows)
- Prints a PASS/FAIL verdict with reasons
- Prints a markdown snippet you can paste into runbooks or PR comments

## Interpreting results
- **PASS: DB looks compatible** — proceed with DB-backed features
- **FAIL: DB incompatible** — review reasons and fix before continuing
  - Missing PostGIS → enable the extension
  - Missing table/column → run migrations or backfill
  - Connection failure → verify env vars/network
  - Data anomalies → consider re-ETL or cleanup

## Next steps
- If failures persist, compare against `docs/db-v3.0.md`
- After fixes, re-run the command until it passes
