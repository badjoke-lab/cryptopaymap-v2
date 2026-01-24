# Ops — CryptoPayMap v2 (Authoritative)

**Version:** v3.1  
**Status:** Final (Submit + Media ops 追記)  
**Scope:** 運用・デプロイ・CI・ロールバック・実行ルール **＋ Submit画像ストレージ運用（無料運営前提）**  
**Audience:** Owner / Codex / Reviewer  
**Hard rule:** ここに書いてないことは Codex に実装させない。ここに書いたことは 100% 実装対象。

---

## 1. 環境構成（本番 / プレビュー）

```

/cryptopaymap-v2
├ vercel (Production)
├ vercel-preview (Preview)
├ neon-prod (Postgres/PostGIS)
└ neon-shadow (Shadow DB for CI)

```

---

## 2. 必須環境変数（.env）

Next.js の `/app` から参照。

| KEY | 説明 | 例 |
|---|---|---|
| DATABASE_URL | Neon（prod/staging） | `postgres://...neon.tech` |
| NEXT_PUBLIC_ENV | `production` or `preview` | `production` |

`.env.local` は GitHub に **絶対コミット禁止**。

---

## 3. Vercel デプロイ手順（本番）

### 3.1 初回
```

1. Connect GitHub → cryptopaymap-v2
2. Framework: Next.js 15
3. Build command: npx next build
4. Output: .vercel/output (auto)
5. Set Environment Variables
6. Deploy

```

### 3.2 本番反映
```

git push main
↓
Vercel 自動ビルド
↓
Production 配信

```

---

## 4. Preview（PRごと）ルール

- GitHub の PR を作成すると Vercel preview が自動生成される
- Codex の PR も Preview が発行される
- マージ前に必ず **UI / API / Drawer / Map の4点**を確認する
- Map の動作確認は **最重要（Pin, Popup, Drawer）**

---

## 5. Shadow DB（CI 用）

Neon の「branch」機能を使用する。

```

neon-prod   ← 本番
neon-shadow ← CI / Codex 用

```

- shadow では migration 不可（schema は本番と同一前提）
- CI は基本 read-only（書き込みが必要なテストは別途検討）

---

## 6. ロールバック手順（最速）

### 6.1 UI/コードの場合
```

git revert <bad-commit>
git push main

```

### 6.2 DB の場合
Neon の **Point-in-Time Recovery**（PITR）を使用：
```

Neon dashboard → Branches → Restore → 最新の安定 snapshot を選択

```

---

## 7. CI（GitHub Actions）

### 7.1 必須ワークフロー
`/.github/workflows/validate.yml`
```

runs:

* pnpm install
* pnpm db:check (schema validation)
* pnpm lint
* pnpm typecheck

```

### 7.2 PR ガード
- 変更対象が `docs/` 配下 → CI なしでも可
- 変更対象が `app/ api/ lib/ scripts/` → CI 必須
- CI fail → マージ不可

---

## 8. Codex 実行ルール（最重要）

Codex に渡す命令は **常に PR 単位** に限定。

### 8.1 Forbidden（禁止）
- DB スキーマ変更（migration 生成）
- 新規テーブル追加
- verification レベルの命名変更（owner/community/directory/unverified）
- accepts 正規化ロジック変更
- v1 コード参照
- docs/ 以外を「まとめて」改変すること（必ず範囲限定）

### 8.2 Allowed（許可）
- app/ 内の UI コンポーネントの追加・修正
- API Routes の実装（/api/places /api/stats /api/submissions 等）
- util / lib の新規追加
- scripts（importer, normalizer, writer）の実装
- stats-snapshot の生成コード
- **Submit confirm導線の追加**
- **Submit画像ストレージ（R2）実装**

---

## 9. ディレクトリ構成（最終）

```

cryptopaymap-v2/
app/
map/
stats/
api/
submit/
internal/
components/
lib/
scripts/
docs/
*.md
public/
.vercel/
package.json
tsconfig.json

```

---

## 10. 本番切替時の手順（確定版）

```

1. docs → 最新化（今回 v2 仕様）
2. Codex → UI / API 実装 PR 作成
3. Preview で以下チェック：
   Map ピン
   Popup
   Drawer
   Filters
   Stats(v3)
   Submit(owner/community/report) + confirm + done
   Internal(submissions list/detail/approve/reject/promote)
   Media(public gallery / internal proof,evidence)
4. OK → main へマージ
5. Vercel → 自動 Production デプロイ
6. /api/stats → 正常レスポンス確認
7. /map → Drawer レンダー確認
8. /submit → 全kindの submit → confirm → done を確認

```

---

## 11. 障害時の対処

### 11.1 UI 崩壊
```

git revert main
push

````

### 11.2 API 500
- Vercel logs を確認
- DB 接続
- DB 内の不正データ確認（特に assets / hours）
- submissions系：`public.submissions` の status/日時整合（approved_at 等）確認

### 11.3 Map レンダリング不全
- `Leaflet` が SSR に巻き込まれている  
  → dynamic / "use client" / noSSR を確認

### 11.4 Submit が 202（Degraded）ばかり
- DBダウン or DATABASE_URL誤りの可能性  
- `data/submissions-pending.ndjson` の増加を確認し、復旧後に回収タスクを実行

---

## 12. Submit / Media Ops（無料運営前提：新規・最重要）

> Submitの画像は「保存先が必要」。無料運営を崩さず成立させるため、ここで運用を固定する。

### 12.1 ストレージ方針（固定）
- **申請画像の保存先は Cloudflare R2 をデフォルト採用**（無料枠運用を前提）
- DBには画像バイナリを保存しない
- `submission_media.url` は **永続URL**（署名URL禁止）
- `gallery` は公開取得可、`proof/evidence` は internal 認証必須

### 12.2 必須環境変数（R2）
（値の例は書かない。Ownerが設定する。）
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_SUBMISSIONS`
- `R2_PUBLIC_BASE_URL`（任意：直配信する場合のみ。基本は使わない）
- `R2_REGION`（S3互換用の指定が必要な場合）

> 注意：**R2の直URLを公開に使わない**。基本はアプリの配信エンドポイント（/api/media...）を永続URLとしてDBに保存する。

### 12.3 オブジェクトキー規約（固定）
- 形式：
  - `submissions/{submissionId}/{kind}/{mediaId}.webp`
- kind は `gallery` / `proof` / `evidence` のみ

### 12.4 アップロード変換（必須：無料運営維持）
アップロード時にサーバ側で必ず：
- EXIF削除
- WebP化（固定圧縮）
- 最大辺リサイズ（例：1600px上限）

目的：
- 保存量/転送量を無料枠内に収める  
- 個人情報（EXIF位置等）の漏洩を防ぐ

### 12.5 公開/非公開の配信ルール（固定）
- public（認証不要・キャッシュ可）  
  - `GET /api/media/submissions/{submissionId}/gallery/{mediaId}`
- internal（認証必須・no-store）  
  - `GET /api/internal/media/submissions/{submissionId}/{kind}/{mediaId}`
  - kind = `proof` / `evidence`

### 12.6 保持期限（無料運営の安全弁：固定）
- `proof` と `evidence` は「審査・対応用」であり恒久保存しない。
- よって保持期限を設ける（具体日数は運用開始時に最終確定して良いが、**期限を設ける方針は固定**）。
  - 推奨：proof 90日 / evidence 180日
- 期限後はR2から削除し、DB側は
  - (a) 行を削除、または
  - (b) url を tombstone に置換（どちらかに統一）
- 削除は定期ジョブ（cron/スケジューラ）で実施（実装フェーズで決める）

### 12.7 無料枠超過のフェイルセーフ（固定）
- R2容量が閾値に近づいたら、フォーム側で **画像添付を停止**できるスイッチを用意する（envフラグ）。
- 添付停止時は、代替として「外部URLの入力（任意）」を許可するかは別途仕様化（当面は停止のみでも可）。
- 目的：無料運営を絶対に崩さない（課金発生を避ける）

---

## 13. 保守タスク一覧（v2 → v3）

| 項目 | 担当 | 状態 |
|---|---|---|
| DB移行後の整合チェック | 手動 | 必須 |
| stats-snapshot v3 | Codex | 実装 |
| filters（カテゴリ/チェーン） | Codex | 実装 |
| drawer-v3.2 | Codex | 実装 |
| popup-v3.2 | Codex | 実装 |
| map-v3.2 | Codex | 実装 |
| Submit confirm + internal | Codex | 必須 |
| Submit media (R2) | Codex | 必須 |
| trends v4（将来） | Gemini | 後続 |
| dashboard v5 | Gemini | 後続 |

---

## 14. Dev smoke checks

Quick commands to verify API output and database rows locally.

```bash
# List route should include Lightning for antarctica-owner-1
curl -s "http://localhost:3000/api/places?country=AQ" | jq '.[] | select(.id=="antarctica-owner-1") | .accepted'

# Detail route should mirror accepted assets
curl -s "http://localhost:3000/api/places/antarctica-owner-1" | jq '.accepted'

# Simple DB smoke-check (requires DATABASE_URL in .env.local or environment)
npm run db:check -- antarctica-owner-1
````

Expected highlights:

* List API includes `Lightning` plus on-chain assets such as `BTC`, `ETH`, and `USDT` for `antarctica-owner-1`.
* Detail API stays reachable (200) and reports the same accepted set including `Lightning`.
* Accepted assets are normalized via the shared helper used by both routes, so the sets match even when falling back to JSON data.
* DB smoke-check prints the place row, payment_accepts entries, and any verification record for the requested id.

---

## 15. CI setup (DATABASE_URL secret)

Smoke checks in GitHub Actions read `DATABASE_URL` from repository secrets.

1. Open **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name it `DATABASE_URL` and paste a connection string for your read-only DB user.

Recommendations:

* Use a read-only database user to avoid accidental writes.
* Point to a stable environment (staging/replica) that matches production schema.
* Keep the connection string minimal (host, db, user, password, sslmode as needed).

Common failures:

* **Missing env**: smoke job logs show `DATABASE_URL` is undefined. Add the secret in GitHub and re-run.
* **Connection refused**: check firewall/IP allowlist, SSL requirements, and that the host is reachable from GitHub Actions.
* **Schema mismatch**: look for migration-related errors in the smoke job output; update the DB or adjust the API expectations.

Troubleshooting:

* GitHub Actions logs → **Smoke** job → **Run smoke** step.
* For local repro, export `DATABASE_URL` before running `npm run smoke`.

---

## 16. Accepted assets ordering (DB-backed)

Run dev server, then:

```bash
BASE="http://localhost:3000"
for id in antarctica-owner-1 antarctica-community-1 antarctica-directory-1 antarctica-unverified-1; do
  echo "== $id =="
  curl -s "$BASE/api/places/$id" | python3 -c 'import json,sys; a=json.load(sys.stdin); print(a.get("verification"), a.get("accepted"))'
done
```

Expected:

* owner       ['BTC','Lightning','ETH','USDT']
* community   ['BTC','ETH']
* directory   ['BTC']
* unverified  ['BTC']

---

## 17. E2E triage (Playwright)

### Run locally

```bash
PW_BASE_URL="http://127.0.0.1:3201" npm run test:map-smoke
```

### When CI fails

Artifacts are uploaded by GitHub Actions. Use trace first:

```bash
npx playwright show-trace test-results/**/trace.zip
```


```
