# DB — CryptoPayMap v2 (Authoritative)

## Appendices (legacy sources)


---

# 📄 **db-v3.0.md — DB 完全仕様（PostgreSQL + PostGIS）**

---

## **1. Overview**

CryptoPayMap v2 のデータベースは、
**Neon（PostgreSQL 15 + PostGIS）** 上で以下の 8 テーブルを持つ。

目的は：

* 堅牢で壊れない
* 将来の拡張（v3=クロステーブル、v4=履歴、v5=BI）に対応
* OSM流入・ユーザー申請・手動モデレーションのすべてを受け止める
* Codex が安全に CRUD API を生成できる

---

## **2. テーブル一覧（8 tables）**

```
places
verifications
payments
payment_accepts
socials
media
categories  ※（v3.1 以降は未使用、互換維持のため残す）
history  ※（stats-trends 用、v4 で運用開始）
```

---

## **3. places（メインテーブル）**

* 世界中の店舗情報の「本体」
* 緯度経度は PostGIS geometry(Point, 4326)
* about / amenities / hours などはここで保持

### **DDL**

```sql
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT,
  category TEXT,
  category_source TEXT,
  category_confidence REAL,

  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,

  hours TEXT,
  about TEXT,
  amenities TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **ポイント**

* `geom` は必ず STORED で生成
* category は string（OSM対策）
* about は Owner/Community の時のみ 300〜600 文字

---

## **4. verifications（検証レベル）**

### **役割**

* owner / community / directory / unverified
* verified 日付、submitted、review、sources を JSONB で持つ

### **DDL**

```sql
CREATE TABLE verifications (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN ('owner','community','directory','unverified')),

  last_checked TIMESTAMPTZ,
  last_verified TIMESTAMPTZ,

  submitted JSONB,
  review JSONB,
  sources JSONB,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## **5. payments（支払い設定の親）**

```sql
CREATE TABLE payments (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  preferred TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## **6. payment_accepts（asset/chain/method/processor）**

正規化された受入通貨行。

```sql
CREATE TABLE payment_accepts (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,

  asset TEXT NOT NULL,
  chain TEXT NOT NULL,
  method TEXT,
  processor TEXT,
  note TEXT,

  UNIQUE(place_id, asset, chain, method)
);
```

---

## **7. socials（SNS / Web / Contacts）**

```sql
CREATE TABLE socials (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT,
  handle TEXT,
  UNIQUE(place_id, platform, url, handle)
);
```

* platform: instagram / facebook / x / tiktok / etc

---

## **8. media（画像ギャラリー）**

```sql
CREATE TABLE media (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  credit TEXT
);
```

制約：

* Owner: 最大 8
* Community: 最大 4
* Directory/Unverified: 0（ETL/CI で除去）

---

## **9. history（推移管理 v4.0 用）**

v4 で使うが、v3 の段階で必ずテーブルだけは作っておく。

```sql
CREATE TABLE history (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

用途：

* stats-trends（推移）
* stats-dashboard（国別・都市別の時系統）
* owner → community など status 移動の記録

---

## **10. インデックス最適化**

```sql
CREATE INDEX idx_places_geom ON places USING GIST (geom);
CREATE INDEX idx_places_category ON places (category);
CREATE INDEX idx_verifications_status ON verifications (status);
CREATE INDEX idx_payment_accepts_place ON payment_accepts (place_id);
```

---

## **11. バックフィル / ETL 対応（data-etl-v3 と連動）**

* JSON → places / verifications / payments / accepts / socials / media の完全分解
* 自動で directory の画像を削除
* asset / chain の正規化
* category の揺れ補正（lowercase → canonical）
* hours の形式をそのまま通す（構造化は v4）

---

## **12. 今後の拡張**

* v4: history を本運用
* v5: materialized view での BI
* v3.1: category テーブルを削除可能
* v6: AI 推奨カテゴリのスコア保存（optional）

---


---

# Database connection contract

This document is the source of truth for how the application connects to Postgres and how
database failures map to API responses.

## Required environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string used by API routes, scripts, and smoke checks. |

Notes:
- Connection strings may include `ssl=true` or `sslmode=require`/`verify-ca`/`verify-full` to force SSL.
- If `DATABASE_URL` is missing, DB-backed routes fail fast and smoke/API checks are skipped.

## Pool settings

The shared pool is created in `lib/db.ts` and reused across routes.

- `max`: **4** connections
- `idleTimeoutMillis`: **20000** (20s)
- `connectionTimeoutMillis`: **7000** (7s)
- `ssl`: enabled when the connection string includes `ssl=true` or `sslmode=require|verify-ca|verify-full`

## Timeout strategy

- Connection acquisition is capped by `connectionTimeoutMillis` (7s).
- No `statement_timeout` or per-query timeout is set in code; Postgres defaults apply.
- If timeouts are needed, update the connection string or add server-side defaults.

## Retry strategy

Retries are implemented in `lib/db.ts` for both `dbQuery` and `getDbClient`.

- Max attempts: **3** (initial try + 2 retries).
- Backoff: **200ms**, then **400ms** for subsequent retries.
- Retries only occur on transient errors, including:
  - Postgres `XX000`
  - Network/driver codes (`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `ECONNREFUSED`)
  - Messages containing `connection terminated`, `connection reset`, `timeout`,
    or `control plane request failed`
- After exhausting retries on transient errors, a `DbUnavailableError` is thrown.
- Callers may disable retries by passing `{ retry: false }` (used for transactional flows).

## API error mapping policy

The API uses a consistent mapping for database-related failures:

- **503 Service Unavailable**: returned when a `DbUnavailableError` is raised
  (e.g., `/api/places`, `/api/places/[id]`, `/api/submissions/[id]/promote`,
  `/api/health`).
- **404 Not Found**: returned when a specific record is missing
  (e.g., `/api/places/[id]`, `/api/submissions/[id]/promote`).
- **400 Bad Request**: returned when input is invalid or a submission is in an
  invalid state (e.g., `/api/submissions/[id]/status`, `/api/submissions/[id]/promote`).
- **500 Internal Server Error**: returned for unexpected failures, including
  schema mismatches or unhandled database errors.

For other endpoints, unhandled exceptions follow Next.js defaults (500).


---

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

## If the check reports missing tables/columns
If `pnpm db:compat-check` fails because tables or columns are missing, run the minimal compatibility migration and re-check:

```bash
pnpm db:migrate:compat
pnpm db:compat-check
```


---

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
