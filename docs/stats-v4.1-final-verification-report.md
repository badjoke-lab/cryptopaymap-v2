# Stats v4.1 最終確認レポート（PR-11再監査）

作成日: 2026-02-27  
対象: `badjoke-lab/cryptopaymap-v2` Stats v4.1  
監査範囲: DoD再監査 + PR #313（Top5 kind固定問題）再検証

---

## 0. 監査方針（このレポートの読み方）

- 本タスクは**監査のみ**として実施（実装変更なし）。
- 判定は `PASS / FAIL / PARTIAL`。
- 実環境（DB接続・Vercelログ・ブラウザ実機）での再生が必要な項目は、未実測の場合に `PARTIAL` とし、**再現可能な手順を明示**。

---

## 1. PR #313 再監査（最重要）

### 1-1. 変更点の確認（事実）

PR #313（commit `b579ca8`）で、`/api/stats/trends` と `StatsPageClient` に以下が追加された。

- `topKind` クエリ受理（`category/country/asset`）。
- フィルタ文脈から `top5Kind` を自動決定する `resolveTopKind`。
- `breakdown_json.breakdowns[top5Kind]` の存在を判定し、不足時は `category` へフォールバック。
- `meta.legend.fallback_kind` / `meta.fallback_kind` を返却。
- UIに kind別タイトル（Top 5 Categories/Countries/Assets）と fallback_kind 警告表示を追加。

### 1-2. PR #313 監査判定

| 観点 | 判定 | 検証方法 | 根拠 |
|---|---|---|---|
| Top5凡例固定が category/country/asset のいずれでも成立 | PASS | コードレビュー（API集計） | `top5Totals` に全ポイントで加算し、期間合計で key ソートして上位5件を固定。`top5Points` は固定 keys を全ポイントに再投影。|
| 期間合計でTop5決定→凡例固定 | PASS | コードレビュー（API集計順序） | `rows` ループで key合計→ループ後に keys確定→固定keysで再構築の順。|
| kind自動決定 / 明示指定仕様 | PASS | コードレビュー + curl手順定義 | `topKind` 明示指定可、未指定時は `resolveTopKind` の規則で決定。|
| breakdown不足時の fallback_kind が嘘禁止 | PASS | コードレビュー + UI表示確認手順定義 | kind不足時は `top5Kind='category'` に強制し `fallback_kind=true` を返却。UI側で警告文を表示。|

---

## 2. DoD 全項目再チェック（v4.1）

## A. データ生成（stats_timeseries）

| ID | 判定 | 検証方法 | 具体的根拠 |
|---|---|---|---|
| A-1 1h=直近48h再計算+UPSERT冪等 | PASS | コードレビュー | `runStatsTimeseriesJob('hourly')` が `sinceHours=48`。INSERTは `ON CONFLICT ... DO UPDATE`。|
| A-2 1d=前日確定（UTC） | PASS | コードレビュー | `resolveWindow(grain=1d)` で `[昨日00:00Z, 今日00:00Z)` を返す。|
| A-3 1w=週次（UTC月曜開始） | PASS | コードレビュー | `startOfUtcWeek` が `(day+6)%7` で月曜起点。|
| A-4 保存dim必須範囲 | PASS | コードレビュー + SQL手順 | `toRows('all','verification','country','category','asset')` 実装あり。|
| A-5 複合dim 2軸3種 | PASS | コードレビュー + SQL手順 | `country|category`, `country|asset`, `category|asset` を `toRows` で保存。|
| A-6 全組合せ保存禁止 | PASS | コードレビュー | `topN` と `COMPOSITE_DIM_WITHIN_PARENT_LIMIT` で保存対象を上限制御。|
| A-7 breakdown_json shape | PASS | コードレビュー + SQL手順 | `verification`, `top_categories`, `top_assets`, `breakdowns(category/asset/country)` を生成。|
| A-8 generated_at更新整合 | PASS | コードレビュー + SQL手順 | upsert update で `generated_at = EXCLUDED.generated_at`。|

## B. Cron運用（Hobby制約）

| ID | 判定 | 検証方法 | 具体的根拠 |
|---|---|---|---|
| B-1 daily cron 1本 | PASS | コードレビュー | `vercel.json` に `/api/internal/cron/stats-timeseries` の1件のみ。|
| B-2 daily内で hourly/daily/weekly 実行 | PASS | コードレビュー | 1リクエスト内で hourly→daily→（月曜のみweekly）。|
| B-3 secret/no-store/ログ | PASS | コードレビュー | secret不一致403、`Cache-Control:no-store`、start/done/failedログ・staleログあり。|
| B-4 失敗時戻り値可読性 | PASS | コードレビュー | 500で `ok:false`, `error`, `durationMs` を返す。|

## C. API `/api/stats/trends`

| ID | 判定 | 検証方法 | 具体的根拠 |
|---|---|---|---|
| C-1 range→grain固定 | PASS | コードレビュー | `RANGE_CONFIG` が `24h=1h, 7d/30d=1d, all=1w`。|
| C-2 保存キューブ参照のみ | PASS | コードレビュー | SQL参照は `public.stats_timeseries` のみ。|
| C-3 データ無し判別 | PASS | コードレビュー + curl手順 | `meta.has_data=false` と `reason/missing_reason` を返す経路あり。|
| C-4 fallback戦略 + 嘘禁止メタ | PASS | コードレビュー + curl手順 | requested/used/fallback/dropped_filters を返却。|
| C-5 last_updated/grain/used cube返却 | PASS | コードレビュー + curl手順 | `last_updated` と `meta.grain`, `meta.used` が返る。|

## D. UI（Stats）

| ID | 判定 | 検証方法 | 具体的根拠 |
|---|---|---|---|
| D-1 Filters連動＋range維持 | PASS | コードレビュー + UI手順 | `useEffect` が `fetchTrends(trendRange, filters)`。range state独立。|
| D-2 fallback明示（代替＋dropped） | PASS | コードレビュー + UI手順 | `trendFallback.applied` で警告表示し dropped filters を表示。|
| D-3 更新情報表示 | PASS | コードレビュー + UI手順 | Last updated / Range / Grain / Cube をヘッダ表示。|
| D-4 真っ白禁止（失敗/欠損/0件） | PASS | コードレビュー + UI手順 | API失敗時は cache or zero-baseline、no data時も zero-baseline、snapshot空状態文言あり。|
| D-5 直近成功キャッシュ注記 | PASS | コードレビュー + UI手順 | localStorage + TTL(24h) + “Showing cached trends …” 表示。|
| D-6 Top5凡例固定 | PASS | コードレビュー + UI手順 | 固定keysを描画、PR #313で kind可変対応。|

## E. 互換性/回帰

| ID | 判定 | 検証方法 | 具体的根拠 |
|---|---|---|---|
| E-1 `/stats` 500回避 | PARTIAL | ローカル実行未実測（手順を後述） | コード上は例外時 fallback 実装あり。だが本監査でE2E未実行。|
| E-2 `/api/stats` 影響なし | PASS | コードレビュー | 変更箇所は trends系で、`/api/stats` のスキーマ直接変更なし。|
| E-3 360px崩れなし | PARTIAL | ローカル実機/ブラウザ未実測（手順を後述） | レスポンシブクラス実装はあるが画面確認未実施。|

---

## 3. 重要観点（追加要求 A〜E）

### A) PR #313 でFAIL解消したか

- **結論: 解消（PASS）**。
- 旧FAIL「Top5推移のkindがcategory固定」は、APIで動的kind + fallback_kind開示に置換済み。
- UIも kindタイトルと fallback警告で整合。

### B) “嘘禁止” 徹底

- fallback（requested/used/dropped_filters）: **PASS**。
- cached注記: **PASS**。
- stale表示/ログ: **PARTIAL**。
  - API/cron側に staleness 判定・ログはある（PASS）。
  - Stats UIで `meta.staleness.message` の直接表示は未確認（未実装に見える）。
- has_data=false の 0ライン＋警告: **PASS**。

### C) 真っ白禁止

- Trends API失敗時: **PASS**（cached or zero-baseline）。
- Snapshot/Trends空状態: **PASS**（警告・no result文言あり）。
- undefined/null/空配列ガード: **PASS**（`Array.isArray` や `?? 0` ガード多数）。
- 360px操作不能回避: **PARTIAL**（コード上は対応、実測未了）。

### D) 保存キューブ原則

- `/api/stats/trends` のオンデマンド重集計禁止: **PASS**。
- range→grain固定: **PASS**。

### E) Cron/Hobby整合

- Vercel cron daily 1本: **PASS**。
- dailyでhourly/daily/weekly実行: **PASS**。
- secret/no-store/ログ: **PASS**。

---

## 4. 未実測項目の再現手順（コピペ用）

### 4-1. UI操作手順（Statsページ）

1. `/stats` を開く。  
2. Trends range を `30d` に変更。  
3. `country` を任意値に変更し、range が `30d` のまま再描画されることを確認。  
4. フィルタを `country + category` へ増やし、Top5タイトルが期待kindに切り替わることを確認。  
5. fallback発生時、警告に `Dropped filters` が出ることを確認。  
6. API停止を模擬し、`cached` または `zero baseline` メッセージで真っ白回避されることを確認。  
7. 画面幅 `360px` で filters/trends/snapshot が操作不能にならないことを確認。

### 4-2. curl例（trends）

```bash
# 基本（7d）
curl -s 'http://localhost:3000/api/stats/trends?range=7d' | jq

# kind明示（country）
curl -s 'http://localhost:3000/api/stats/trends?range=30d&topKind=country' | jq '.top5.kind, .meta.legend, .meta.fallback_kind'

# フィルタ付き（fallback確認）
curl -s 'http://localhost:3000/api/stats/trends?range=30d&country=JP&city=Tokyo&source=owner' \
  | jq '.meta.requested, .meta.used, .meta.fallback'

# データ欠損確認（存在しないキー）
curl -s 'http://localhost:3000/api/stats/trends?range=7d&asset=__NO_SUCH_ASSET__' \
  | jq '.meta.has_data, .meta.missing_reason, .points[0]'
```

### 4-3. SQL例（timeseries健全性）

```sql
-- dim_type カバレッジ
SELECT grain, dim_type, COUNT(*)
FROM public.stats_timeseries
GROUP BY 1,2
ORDER BY 1,2;

-- 最新 generated_at
SELECT grain, MAX(generated_at) AS latest_generated_at
FROM public.stats_timeseries
GROUP BY 1
ORDER BY 1;

-- 複合dim確認
SELECT DISTINCT dim_type
FROM public.stats_timeseries
WHERE dim_type LIKE '%|%'
ORDER BY 1;

-- breakdown_json shape spot-check
SELECT period_start, grain, dim_type, dim_key, breakdown_json
FROM public.stats_timeseries
WHERE dim_type='all'
ORDER BY period_start DESC
LIMIT 3;
```

### 4-4. ログ確認ポイント（cron / stale）

- Vercel Function Logs で `[cron][stats-timeseries]` を検索。
- 必須確認:
  - `start mode=daily`
  - `hourly upserted=...`
  - `daily upserted=...`
  - `weekly upserted=...` または `weekly skipped reason=not_monday_utc`
  - `[stats][stale] ... status=FRESH/STALE`
  - `done mode=daily durationMs=...`

---

## 5. 最終結論

- **v4.1 is DONE: Yes（コード監査ベース）**
  - PR #313により、前回FAILの「Top5 kind category固定」は解消済み。
  - DoD必須項目は実装上すべて満たす。

- **残るPARTIAL**
  1. E-1 `/stats` 実環境E2E未実測  
  2. E-3 360px実画面未実測  
  3. staleのUI文言（`meta.staleness.message`）は運用要件としては追加余地

- **仕様として許容か / 修正必要か**
  - E-1/E-3 未実測は「監査実施環境の制約」に起因するため、**release blockerではないが、リリース前の運用チェックで実測推奨**。
  - stale UI表示強化は **P2（運用品質改善）**。

- **次PR候補（必要時）**
  - P2: `feat(stats-ui): show meta.staleness.message in trends header`
  - P2: `test(stats): add Playwright smoke for 360px + fallback/cached/stale banners`
