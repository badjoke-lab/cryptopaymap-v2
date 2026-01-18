# DB check (Postgres + PostGIS)

## Purpose

`npm run db:check` verifies that:

- `DATABASE_URL` is available
- Postgres is reachable
- PostGIS is installed
- Core tables for CryptoPayMap v2 exist
- A tiny read query succeeds (`places` count)

## Command

```bash
npm run db:check
```

## Expected output (success)

```text
[db-check] Database OK
[db-check] places count: 123
```

## Common failures

### DATABASE_URL missing

```text
DATABASE_URL is not set. Add it to .env.local or export it before running this script.
```

### PostGIS missing

```text
PostGIS extension is missing. Run: CREATE EXTENSION postgis;
```

### Missing tables

```text
Missing required tables: places, verifications
```

## Notes

- The script reads `.env.local` if `DATABASE_URL` is not already set.
- Use this for deterministic smoke checks during development or troubleshooting.
