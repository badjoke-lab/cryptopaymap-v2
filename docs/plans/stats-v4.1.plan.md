# Stats v4.1 開発計画（FULL COMPLIANCE到達）

- 対象入力: `docs/audits/stats-v4.1.audit.md` の WorkItems 1-11
- 合否基準: `docs/stats-v4.1.checklist.md` 全項目OK + `docs/audits/stats-v4.1.audit.md` を FULL COMPLIANCE 化
- 方針: **実装順序を固定し、PR単位で監査可能な最小差分に分割**する

---

## 0. 実施原則（v4.0互換維持）

1. `/api/stats` の既存契約は非破壊（破壊的変更禁止）。
2. `/api/stats/trends` は新規フィールド追加を基本にし、既存フィールドは維持（optional fields で段階導入）。
3. 保存キューブ読取経路は feature flag（例: `STATS_V41_READ_FROM_CUBE=1`）で切替可能にする。
4. ジョブ導入後も、初期段階では fallback（0ライン + notice）を維持し、段階的に strict 化する。
5. PRごとに「stats以外への波及」をテストで抑止（`/api/places`, submissions など既存スモークを回帰確認）。

---

## 1. PR分割計画

### PR-1: API契約の先行整備（Filter連動 + メタ拡張 + UI注記枠）

- 目的
  - WorkItems: **1, 10** の土台を先に作り、Snapshot/Trends同一条件を API 契約で保証する。
  - UIに `cube_type` / `fallback_applied` / `unsupported_combination_note` を表示できる受け口を先行追加する（値は暫定でも契約固定）。

- 変更対象ファイル（具体名）
  - `app/api/stats/trends/route.ts`
  - `app/(site)/stats/StatsPageClient.tsx`
  - `lib/types/stats.ts`
  - `lib/stats/utils.ts`（フィルタ正規化共通化先として）

- 追加/変更APIフィールド・パラメータ
  - `/api/stats/trends` query に追加:
    - `country`, `city`, `category`, `accepted`, `verification`, `promoted`, `source`
  - `/api/stats/trends` response `meta` に追加:
    - `cube_type?: 'core' | 'warm_cache' | 'fallback_zero'`
    - `fallback_applied?: boolean`
    - `unsupported_combination_note?: string | null`

- 追加/変更DB・Migration
  - なし（契約先行PRのため）。

- 追加/変更ジョブ
  - なし。

- 互換性（v4.0非破壊）
  - 既存 `range` のみ呼び出しでも動作。
  - 新規 query は optional。
  - 新規 meta は optional 追加で既存描画を壊さない。

- リスクと回帰点
  - `StatsPageClient` の fetch パラメータ変更による snapshot 側のクエリ肥大。
  - フィルタ正規化ロジック共通化時に `/api/stats` 側との挙動差が出るリスク。

---

### PR-2: 保存テーブル + Core Cube 生成基盤（DB中心）

- 目的
  - WorkItems: **2, 3** を実装し、Trendsの読取元を作る。
  - 「保存キューブ」をこのPRで導入する（依存順の最重要）。

- 変更対象ファイル（具体名）
  - `migrations/2026xxxx_stats_timeseries.sql`（新規）
  - `db/schema.prisma`（`stats_timeseries` 相当モデル追加）
  - `lib/db/index.ts`（必要なら型/接続補助）
  - `lib/stats/trends.ts`（Core Cube計算ロジック新設/再編）
  - `lib/stats/aggregate.ts`（TopN固定算出ヘルパー追加）

- 追加/変更APIフィールド・パラメータ
  - なし（内部基盤PR）。

- 追加/変更DBテーブル/インデックス/マイグレーション
  - 新規テーブル `stats_timeseries`:
    - 列: `period_start`, `period_end`, `grain`, `dim_type`, `dim_key`, `total_count`, `verified_count`, `accepting_any_count`, `breakdown_json`, `generated_at`
  - 制約/Index:
    - PK: `(period_start, grain, dim_type, dim_key)`
    - 追加Index案: `(grain, dim_type, dim_key, period_start desc)`, `(generated_at desc)`
  - マイグレーション: 上記DDL + rollback SQL を同梱。

- 追加/変更ジョブ
  - まだ本稼働させない（PR-3で接続）。
  - ただし再利用可能な `computeCoreCube(grain, window)` 関数群はこのPRで用意。

- 互換性（v4.0非破壊）
  - 新規テーブル追加のみ。既存テーブル・既存APIに変更なし。

- リスクと回帰点
  - 集計キー設計ミスによる将来の重複保存。
  - `breakdown_json` スキーマの将来互換（Top5拡張）を想定して versioned payload 推奨。

---

### PR-3: Hourly/Daily/Weekly Job 実装（更新間隔の仕様準拠）

- 目的
  - WorkItems: **4, 5, 6** を実装し、更新間隔要件を満たす。
  - 「更新間隔」はこのPRで完成させる。

- 変更対象ファイル（具体名）
  - `scripts/stats/hourly_cube_job.ts`（新規）
  - `scripts/stats/daily_cube_job.ts`（新規）
  - `scripts/stats/weekly_cube_job.ts`（新規）
  - `.github/workflows/stats-hourly.yml`（新規）
  - `.github/workflows/stats-daily.yml`（新規）
  - `.github/workflows/stats-weekly.yml`（新規）
  - `docs/ops.md`（運用手順追記）

- 追加/変更APIフィールド・パラメータ
  - なし（ジョブPR）。

- 追加/変更DBテーブル/インデックス/マイグレーション
  - なし（PR-2テーブルを利用）。

- 追加/変更ジョブ（hourly/daily/weekly）とスケジュール
  - Hourly: 毎時 `0 * * * *`、1h grain を直近48h再計算（表示は24h）。
  - Daily: 毎日 `10 0 * * *`、1d grain 前日確定 + 7d/30d TopN再計算。
  - Weekly: 毎週 `20 0 * * 1`、1w grain を生成して all 向け集約。

- 互換性（v4.0非破壊）
  - ジョブはバックグラウンド追加のみで既存API非破壊。
  - 失敗時もAPIは既存経路で応答可能（PR-4切替前）。

- リスクと回帰点
  - GitHub Actions 実行失敗時の更新遅延。
  - DB負荷ピーク（毎時再計算）→ 実行時間監視 + chunk処理を設計。

---

### PR-4: Trends read path を保存キューブ化 + Warm Cache導入

- 目的
  - WorkItems: **7, 8** を実装し、オンデマンド重SQL依存を解消する。
  - 「Warm Cache」はこのPRで導入する。

- 変更対象ファイル（具体名）
  - `app/api/stats/trends/route.ts`
  - `lib/stats/trends.ts`
  - `lib/stats/dashboard.ts`（必要なら cache/key 共有）
  - `lib/stats/utils.ts`
  - `lib/types/stats.ts`

- 追加/変更APIフィールド・パラメータ
  - `meta.cube_type` に実値を設定（`core` / `warm_cache` / `fallback_zero`）。
  - `meta.fallback_applied` を実運用値で返却。
  - `meta.unsupported_combination_note` で非対応組合せを明示。

- 追加/変更DBテーブル/インデックス/マイグレーション
  - 追加テーブルは原則なし。
  - Warm Cache はメモリLRU（TTL=24h, max=1000）で実装しDBに新規永続化は持たない。

- 追加/変更ジョブ
  - なし（PR-3ジョブ成果物を参照）。

- 互換性（v4.0非破壊）
  - feature flag により read path を段階切替。
  - flag off 時は既存経路維持（ロールバック容易）。

- リスクと回帰点
  - キャッシュキー設計不備で誤配信の恐れ（filter normalization必須）。
  - 保存キューブ欠損時の fallback 連鎖でレイテンシ悪化。

---

### PR-5: Trends内訳拡張（Top5 category/country/asset + TopN固定）

- 目的
  - WorkItems: **9** を実装し、Trends視覚要件を満たす。

- 変更対象ファイル（具体名）
  - `app/api/stats/trends/route.ts`
  - `app/(site)/stats/StatsPageClient.tsx`
  - `lib/stats/aggregate.ts`
  - `lib/types/stats.ts`

- 追加/変更APIフィールド・パラメータ
  - `breakdowns` を拡張:
    - `category_top5`, `country_top5`, `asset_top5`（系列配列）
  - `meta.topn_basis`（例: `period_total_fixed`）を追加しTopN固定根拠を明示。

- 追加/変更DBテーブル/インデックス/マイグレーション
  - 原則なし（`breakdown_json` 活用）。

- 追加/変更ジョブ
  - Daily job で TopN再計算済みデータを利用。

- 互換性（v4.0非破壊）
  - 新規グラフは追加表示。既存KPI推移は維持。
  - API新規フィールドは optional 追加。

- リスクと回帰点
  - モバイル表示密度の悪化。
  - TopN固定実装の境界（同率順位・null処理）で見え方が変わる。

---

### PR-6: 受け入れテスト整備 + 監査再実施

- 目的
  - WorkItems: **11** を実装し、FULL COMPLIANCE判定を固定化する。

- 変更対象ファイル（具体名）
  - `tests/audit/stats-v4.1-api.test.ts`（新規）
  - `tests/ux/stats-v4.1-mobile.smoke.spec.ts`（新規, Playwright）
  - `scripts/smoke_stats_v41.mjs`（新規）
  - `docs/audits/stats-v4.1.audit.md`（再判定追記）
  - `docs/stats-v4.1.checklist.md`（チェック済み反映）

- 追加/変更APIフィールド・パラメータ
  - なし（検証PR）。

- 追加/変更DBテーブル/インデックス/マイグレーション
  - なし。

- 追加/変更ジョブ
  - なし（ジョブ動作検証のみ）。

- 互換性（v4.0非破壊）
  - テスト追加のみ。

- リスクと回帰点
  - CI時間増加。
  - E2E flaky 化（時刻依存データ）→ fixture固定・mock clock検討。

---

## 2. WorkItems割当トレーサビリティ

| WorkItem | 内容 | 割当PR |
|---|---|---|
| 1 | Trends APIにフィルタ入力契約追加 | PR-1 |
| 2 | `stats_timeseries` 保存テーブル新設 | PR-2 |
| 3 | Core Cube事前計算パイプライン | PR-2 |
| 4 | Hourly Job（毎時・48h再計算） | PR-3 |
| 5 | Daily Job（日次・TopN再計算） | PR-3 |
| 6 | Weekly Job（週次集約） | PR-3 |
| 7 | Trends APIを保存済みキューブ read path に置換 | PR-4 |
| 8 | 未保存複合条件向け Warm Cache（TTL24h/LRU1000） | PR-4 |
| 9 | Trends内訳拡張（Top5 category/country/asset） | PR-5 |
| 10 | UI注記表示の強化 | PR-1（受け口） + PR-4（実値） |
| 11 | 受け入れテスト追加 | PR-6 |

> 監査受け入れ条件「WorkItems漏れなし」を満たすため、全11項目をPRに明示割当済み。

---

## 3. 依存関係と実行順序

推奨順序（この順でPRを出せばv4.1を再現的に完成可能）:

1. **PR-1（API契約）**
2. **PR-2（DB/保存キューブ基盤）**
3. **PR-3（更新ジョブ）**
4. **PR-4（API read path置換 + Warm Cache）**
5. **PR-5（Top5内訳UI/API）**
6. **PR-6（テスト・監査クローズ）**

明示事項:
- **保存キューブ**: PR-2で導入。
- **更新間隔（hourly/daily/weekly）**: PR-3で導入。
- **Warm Cache**: PR-4で導入。

---

## 4. 検証計画（スマホ運用前提）

### 4.1 自動化（推奨）

- APIスモーク（CI）
  - `/api/stats` 200 + 必須KPIキー存在。
  - `/api/stats/trends?range=7d&country=...` 200 + `meta.grain=1d`。
  - Snapshot/Trends で同一フィルタ時に0件/非0件が論理整合すること。

- Playwright（モバイル viewport）
  - 画面幅 390px で `/stats` を開く。
  - Filters 折りたたみ展開 → range 切替（24h/7d/30d/all）→ 応答確認。
  - フィルタ（country/category）変更後、Trendsが再取得されること。
  - Trendsヘッダに `cube_type` / fallback注記が表示されること。
  - ツールチップのタップ固定が維持されること。

### 4.2 手動確認（最低限）

1. スマホ実機で `/stats` を開き、デフォルト `7d` で描画される。  
2. Filters を開閉し、`country` と `category` を選択。  
3. 同条件で Snapshot の値と Trends 末尾ポイントの整合を確認。  
4. range を `24h → 30d → all` に切替し、粒度表示（1h/1d/1w）が追従する。  
5. 非対応複合条件を作り、代替適用注記が表示される。  
6. 0件条件を作り、Snapshot全0 + Trends 0ラインになる。  
7. DB停止相当の障害注入時、直近成功キャッシュ優先、なければ警告付き0ラインを確認。  

---

## 5. 完了条件（Definition of Done）

1. `docs/audits/stats-v4.1.audit.md` が **FULL COMPLIANCE** 判定になる。  
2. `docs/stats-v4.1.checklist.md` の全チェックが **OK** になる。  
3. `/api/stats` と `/api/stats/trends` が v4.0互換を維持したまま v4.1拡張項目を返す。  
4. PR-1〜PR-6 が順番通りにマージされ、ロールバック可能性（feature flag）を保持する。  

---

## 6. 主要リスクと緩和策

- リスクA: 集計コスト増（hourly再計算）
  - 緩和: 48h窓の限定再計算 + 実行時間メトリクス計測 + タイムアウト閾値設定。

- リスクB: フィルタ組合せ爆発
  - 緩和: Core Cube対象を明示限定、未対応は Warm Cache + 注記で吸収。

- リスクC: モバイル可読性低下（Top5追加）
  - 緩和: 初期表示の折りたたみ、優先系列のみ表示、凡例タップで強調。

- リスクD: v4.0回帰
  - 緩和: feature flag と既存レスポンス互換維持、回帰スモークをPRごと実行。
