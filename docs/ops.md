# Ops — CryptoPayMap v2 (Authoritative)

## Appendices (legacy sources)


---

# 📄 **ops-v3.0.md — 運用 / デプロイ / 環境構築 仕様書（最終版）**

**Version:** v3.0
**Status:** Final
**Scope:** CryptoPayMap v2 の運用・デプロイ・CI・ロールバック・Codex 実行ルール
**Audience:** あなた（Owner）、Codex、Gemini
**Note:** DB移行済み（PostgreSQL + PostGIS / Neon）を前提とする

---

# 1. 環境構成（本番 / ステージング）

```
/cryptopaymap-v2
   ├ vercel (Production)
   ├ vercel-preview (Preview)
   ├ neon-prod (Postgres/PostGIS)
   └ neon-shadow (Shadow DB for CI)
```

---

# 2. 必須環境変数（.env）

Next.js の `/app` から参照。

| KEY                                  | 説明                        | 例                         |
| ------------------------------------ | ------------------------- | ------------------------- |
| DATABASE_URL                         | Neon（prod）                | `postgres://...neon.tech` |
| NEXT_PUBLIC_MAPBOX_TOKEN（使用しない場合は不要） | reserved                  | ー                         |
| NEXT_PUBLIC_ENV                      | `production` or `preview` | `production`              |

`.env.local` は GitHub に **絶対コミット禁止**。

---

# 3. Vercel デプロイ手順（本番）

## 3.1 初回

```
1. Connect GitHub → cryptopaymap-v2
2. Framework: Next.js 15
3. Build command: npx next build
4. Output: .vercel/output (auto)
5. Set Environment Variables
6. Deploy
```

## 3.2 本番反映

```
git push main
↓
Vercel 自動ビルド
↓
Production 配信
```

---

# 4. Preview（PRごと）ルール

* GitHub の PR を作成すると Vercel preview が自動生成される
* Codex の PR も Preview が発行される
* マージ前に必ず **UI / API / Drawer / Map の4点** を確認する
* Map の動作確認は **最重要（Pin, Popup, Drawer）**

---

# 5. Shadow DB（CI 用）

Neon の「branch」機能を使用する。

```
neon-prod   ← 本番
neon-shadow ← CI / Codex 用
```

shadow では migration 不可
→ schema は本番と同一前提。

---

# 6. ロールバック手順（最速）

## 6.1 UI/コードの場合

```
git revert <bad-commit>
git push main
```

---

## 6.2 DB の場合

Neon の **Point-in-Time Recovery**（PITR）を使用：

```
Neon dashboard → Branches → Restore → 最新の安定 snapshot を選択
```

---

# 7. CI（GitHub Actions）

## 7.1 必須ワークフロー

`/.github/workflows/validate.yml`

```
runs:
  - pnpm install
  - pnpm db:check (schema validation)
  - pnpm lint
  - pnpm typecheck
```

## 7.2 PR ガード

```
変更対象が docs/ 配下 → CI なし
変更対象が app/ api/ lib/ → CI 必須
CI fail → マージ不可
```

---

# 8. Codex 実行ルール（最重要）

Codex に渡す命令は **常に PR 単位** に限定。

## 8.1 Forbidden（禁止）

* DB スキーマ変更（migration 生成）
* 新規テーブル追加
* verification レベルの命名変更
* accepts の正規化ロジック変更
* v1 コード参照
* docs/ 以外のファイルを「まとめて」改変すること

## 8.2 Allowed（許可）

* app/ 内の UI コンポーネントの追加・修正
* API Routes の実装（/api/places /api/stats など）
* util / lib の新規追加
* scripts（importer, normalizer, writer）の実装
* stats-snapshot の生成コード

---

# 9. ディレクトリ構成（Codex / Gemini 前提 最終版）

```
cryptopaymap-v2/
  app/
    map/
    stats/
    api/
  components/
  lib/
  scripts/
    importer.ts
    normalizer.ts
    writer.ts
    build-snapshot.ts
  docs/
    *.md   ← 仕様書全てここ
  public/
  .vercel/
  package.json
  tsconfig.json
```

---

# 10. 本番切替時の手順（確定版）

```
1. docs → 最新化（今回 codex v2 仕様）
2. Codex → UI / API 実装 PR 作成
3. Preview で以下チェック：
      Map ピン
      Popup
      Drawer
      Filters
      Stats(v3)
4. OK → main へマージ
5. Vercel → 自動 Production デプロイ
6. /api/stats → 正常レスポンス確認
7. /map → Owner/Community の Drawer レンダー確認
```

---

# 11. 障害時の対処

## 11.1 UI 崩壊

```
git revert main
push
```

## 11.2 API 500

```
Vercel logs
DB 接続
DB 内の不正データ確認（特に assets / hours）
```

## 11.3 Map レンダリング不全

* `Leaflet` が SSR に巻き込まれている
  → dynamic / "use client" / noSSR を確認

---

# 12. 保守タスク一覧（v2 → v3）

| 項目                 | 担当     | 状態 |
| ------------------ | ------ | -- |
| DB移行後の整合チェック       | 手動     | 必須 |
| stats-snapshot v3  | Codex  | 実装 |
| filters（カテゴリ/チェーン） | Codex  | 実装 |
| drawer-v3.2        | Codex  | 実装 |
| popup-v3.2         | Codex  | 実装 |
| map-v3.2           | Codex  | 実装 |
| trends v4（将来）      | Gemini | 後続 |
| dashboard v5       | Gemini | 後続 |

---

# 13. 注意（Owner だけへの指示）

* この ops.md が **Codex と Gemini の判断基準の基礎**
* ここに書いてない事は Codex に「実装させない」
* ここに書いてあるものは **100% 実装対象**
* ドロワー / ポップアップ 仕様を優先（UI の中核）



指示どうぞ。


---

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


---

# E2E triage (Playwright)

## Run locally
PW_BASE_URL="http://127.0.0.1:3201" npm run test:map-smoke

## When CI fails
Artifacts are uploaded by GitHub Actions.
Use trace first:

npx playwright show-trace test-results/**/trace.zip
