# Stats v4.1 Compliance Report（PR-11）

最終更新: 2026-02-27  
監査対象: `docs/stats-v4.1.md`（正本）との一致性検証（実装監査）

---

## 1. 監査方法（機械的チェック）

- 仕様読解: `docs/stats-v4.1.md`
- 既存監査参照: `docs/audits/stats-v4.1.audit.md`
- 実装突合:
  - API: `app/api/stats/trends/route.ts`
  - Timeseries生成: `lib/stats/generateTimeseries.ts`, `scripts/generate_stats_timeseries.ts`
  - Cron: `app/api/internal/cron/stats-timeseries/route.ts`, `vercel.json`
  - UI: `app/(site)/stats/StatsPageClient.tsx`
  - 補助運用: `scripts/backfill_stats_timeseries.ts`, `scripts/check_stats_timeseries_gaps.ts`

> 注: 本PRはドキュメント監査のみで、Stats挙動変更コードは実施していない。

---

> PR-12更新（Top5 kind切替対応）:
> - `/api/stats/trends` は `topKind` クエリ（category/country/asset）を受理し、未指定時は使用フィルタから kind を自動決定。
> - breakdown未保存時は category へフォールバックし、`meta.fallback_kind=true` を返却。
> - UIは `meta.legend.kind` で凡例タイトルを動的化し、kindフォールバック注記を表示。

## 2. 仕様項目ごとの準拠判定

## A. データ生成（stats_timeseries）

### A-1 1h: 直近48h再計算（UPSERT冪等）
- 要件: 1hは毎回48h再計算、保存は冪等。
- 現状実装:
  - `runStatsTimeseriesJob("hourly")` が `sinceHours:48` を使用。
  - upsertは `ON CONFLICT (period_start, grain, dim_type, dim_key) DO UPDATE`。
- 検証結果: **PASS**
- 根拠: `lib/stats/generateTimeseries.ts`。
- 差分/影響: なし。

### A-2 1d: 前日確定（UTC）
- 要件: 日次は前日バケットをUTCで確定。
- 現状実装: `resolveWindow(1d)` が `[昨日00:00Z, 今日00:00Z)`。
- 検証結果: **PASS**
- 根拠: `startOfUtcDay` + `resolveWindow`。
- 差分/影響: なし。

### A-3 1w: 週次集約（週境界定義）
- 要件: 週境界を明示して週次集約。
- 現状実装: `startOfUtcWeek` が UTC月曜始まり。
- 検証結果: **PASS**
- 根拠: `(day+6)%7` で月曜基準へ補正。
- 差分/影響: なし。

### A-4 dim_type（必須）
- 要件: `all / verification / country / category / asset`。
- 現状実装: 上記5種類を `toRows` で保存。
- 検証結果: **PASS**
- 根拠: `buildRows` の `toRows(...)`。
- 差分/影響: なし。

### A-5 複合dim
- 要件: `country|category / country|asset / category|asset`（3複合任意）。
- 現状実装: 2複合3種を生成・保存。3複合は未実装。
- 検証結果: **PASS（必須範囲）**
- 根拠: `buildRows` の複合集計。
- 差分/影響: 3複合は任意扱い。

### A-6 保存対象制限（全組合せ禁止）
- 要件: topN制約で保存対象を限定。
- 現状実装: `topN`, `COMPOSITE_DIM_WITHIN_PARENT_LIMIT` で制限。
- 検証結果: **PASS**
- 根拠: top key抽出 + 親内上限。
- 差分/影響: なし。

### A-7 breakdown_json shape
- 要件: verificationと内訳が復元可能。
- 現状実装: `verification`, `top_categories`, `top_assets`, `breakdowns(category/asset/country)` を保存。
- 検証結果: **PASS**
- 根拠: `buildBreakdownJson`。
- 差分/影響: なし。

### A-8 generated_at整合
- 要件: 再生成時に generated_at が更新。
- 現状実装: insert値 `now()`、conflict updateで `generated_at = EXCLUDED.generated_at`。
- 検証結果: **PASS**
- 根拠: upsert SQL。
- 差分/影響: なし。

---

## B. Cron運用（Hobby制約）

### B-1 daily 1本
- 要件: Vercel cronは1本（daily）。
- 現状実装: `vercel.json` に日次1件のみ。
- 検証結果: **PASS**
- 根拠: schedule `10 0 * * *`。

### B-2 daily内で hourly/daily/weekly相当
- 要件: 日次実行内で集約実行。
- 現状実装: handlerで hourly→daily→(月曜のみweekly)。
- 検証結果: **PASS**
- 根拠: `runStatsTimeseriesJob` を連続実行。

### B-3 secret/no-store/log
- 要件: secret認可、no-store、ログ。
- 現状実装: bearer/x-cron-secret検証、jsonNoStore、開始/完了/stalenessログ。
- 検証結果: **PASS**
- 根拠: route.ts 内の認可分岐とヘッダ。

### B-4 失敗時戻り値可読性
- 要件: 失敗時も追跡可能な応答/ログ。
- 現状実装: `ok:false` + error + durationMs を返却、prefix付きerror log。
- 検証結果: **PASS**
- 根拠: catch節。

---

## C. API（`/api/stats/trends`）

### C-1 range→grain固定
- 要件: `24h=1h`, `7d/30d=1d`, `all=1w`。
- 現状実装: `RANGE_CONFIG` に固定定義あり。
- 検証結果: **PASS**
- 根拠: `RANGE_CONFIG`。

### C-2 保存キューブ参照のみ
- 要件: オンデマンド重集計禁止。
- 現状実装: `public.stats_timeseries` 参照のみ。
- 検証結果: **PASS**
- 根拠: existence判定SQL + data取得SQL。

### C-3 データ無し判別
- 要件: `has_data` 等で判別可能。
- 現状実装: `meta.has_data`, `reason`, `missing_reason` を返却。
- 検証結果: **PASS**
- 根拠: table未作成時/rows空時レスポンス。

### C-4 fallback戦略 + 嘘禁止
- 要件: requestedとusedを分離し、落とした条件を明示。
- 現状実装: candidate順検索、`meta.requested/used/fallback.dropped_filters` を返却。
- 検証結果: **PASS**
- 根拠: `buildFallbackCandidates` と `fallback` meta。

### C-5 `last_updated / grain / used cube`
- 要件: 3要素返却。
- 現状実装: body `last_updated`, `grain`; meta `used`。
- 検証結果: **PASS**
- 根拠: レスポンス構築。

### C-6 Top5内訳推移（verification/category/country/asset）
- 要件: Top5 categories/countries/assets。
- 現状実装: `topKind` 明示指定対応 + フィルタ状況による自動kind決定 + 未保存時categoryフォールバック。
- 検証結果: **PASS**
- 根拠: `parseTopKind` / `resolveTopKind` / `meta.fallback_kind` と `legend.kind`。
- 差分/影響: PR-11のFAIL項目を解消。

### C-7 フィルタ次元網羅（city/chain/promoted/source）
- 要件: v4.1データ前提に含まれる次元を扱えること。
- 現状実装:
  - APIは city/promoted/source/verification も受理する。
  - ただし生成キューブ側に `city/chain/promoted/source` の保存実装がないため fallback頻発。
- 検証結果: **PARTIAL**
- 根拠: API受理あり、生成側 `toRows` に該当dim無し。
- 不一致/影響: これらfilterで requested cubeが見つからず意図せず粒度を落とす可能性。

---

## D. UI（Stats）

### D-1 Filters連動（range維持）
- 要件: filter変更でTrends再取得、range維持。
- 現状実装: `useEffect(fetchTrends(trendRange, filters))`。
- 検証結果: **PASS**
- 根拠: trendRange stateを保持したままfilters依存で再取得。

### D-2 fallback明示
- 要件: 代替表示と dropped filter 明示。
- 現状実装: `trendFallback.applied` で警告表示し dropped filters表示。
- 検証結果: **PASS**
- 根拠: fallback alert文言。

### D-3 更新情報表示
- 要件: Last updated / grain / cube を表示。
- 現状実装: Trends headerに3要素表示。
- 検証結果: **PASS**
- 根拠: Trendsセクション上部のメタ文言。

### D-4 失敗/欠損/0件で真っ白禁止
- 要件: 0ライン+警告 or empty state。
- 現状実装: zero baseline生成、警告バナー、snapshot no-result文言あり。
- 検証結果: **PASS**
- 根拠: `createZeroBaselineTrends` と warning rendering。

### D-5 直近成功キャッシュ注記
- 要件: cache利用時注記が正しい。
- 現状実装: localStorage保存、24h TTL、cache表示時の注記あり。
- 検証結果: **PASS**
- 根拠: `TRENDS_CACHE_TTL_MS` と cache banner。

### D-6 Top5凡例固定
- 要件: range内合計Top5で凡例固定。
- 現状実装: APIでkind別top5 totalsを集計しkeys固定、UIは`meta.legend.kind/keys`を使用。
- 検証結果: **PASS**
- 根拠: API `top5Totals` + UI dynamic legend title利用。
- 差分/影響: kind固定問題を解消。

---

## E. 互換性/回帰

### E-1 Statsページ500回避
- 要件: 既存ページの致命停止回避。
- 現状実装: snapshot/trends双方でAPI失敗時フォールバックあり。
- 検証結果: **PARTIAL（実行検証は環境制約）**
- 根拠: コード上フォールバックは存在。`pnpm build` は外部取得失敗で未実施。

### E-2 `/api/stats` への影響なし
- 要件: snapshot API回帰なし。
- 現状実装: `app/api/stats/route.ts` は trends cubeロジックに依存していない。
- 検証結果: **PASS（静的監査）**
- 根拠: 参照対象は既存集計/fallback経路。

### E-3 モバイル360px崩れなし
- 要件: 最低限レイアウト崩れ回避。
- 現状実装: mobile向け折りたたみ・responsiveクラスあり。
- 検証結果: **PARTIAL（実機/ブラウザ未検証）**
- 根拠: コード上対応あり、視覚確認未実施。

---

## 3. 集計サマリ

- **PASS: 27**
- **PARTIAL: 3**
- **FAIL: 0**

### FAIL/PARTIAL詳細
1. **PARTIAL (P1)**: city/chain/promoted/source の時系列キューブ未保存でfallback依存。
2. **PARTIAL (P2)**: `/stats` 500回避の実行確認は未完（build環境制約）。
3. **PARTIAL (P2)**: 360px表示の実画面検証未完。

---

## 4. 追加で必要な修正PR候補（本PRでは未実施）

1. **PR案**: `feat(stats-trends): add top5 kind switch for category/country/asset`
   - 作業内容:
     - `/api/stats/trends` で `top5_kind` 指定受理（またはfilter文脈で自動選択）。
     - `breakdown_json.breakdowns.country/asset` からseries返却。
     - UIでkind切替タブ追加 or 3チャート表示。

2. **PR案**: `feat(stats-timeseries): add dim cubes for city/chain/promoted/source`
   - 作業内容:
     - 生成処理に `city/chain/promoted/source` dim_type保存を追加。
     - topN/保存上限制御を同時実装。
     - trends fallback率を低下させる。

3. **PR案**: `test(stats): add v4.1 visual smoke for 360px and trends fallback states`
   - 作業内容:
     - Playwrightで360pxスクリーンショット比較。
     - fallback/cached/zero-baseline表示の回帰テスト追加。

4. **PR案**: `ci: pin pnpm runtime for offline build resilience`
   - 作業内容:
     - CI/開発環境でcorepack依存の取得失敗を回避（pnpm事前配布など）。

---

## 5. 既知リスク / 運用注意

- Hobby制約のため cron は daily 1本。日次実行失敗時、hourly/daily/weeklyの全更新が同時に遅延する。
- 月曜実行失敗時は weekly の遅延が最長1週間残る可能性がある（翌日以降は weekly skip）。
- `meta.staleness` 監視を運用必須とし、`1h:3h, 1d:48h, 1w:14d` を超えたらアラート対象。
- フィルタ次元が未保存キューブの場合は fallback表示になるため、利用者への「代替表示中」明示を消さないこと。

---

## 6. DB確認SQL（運用/監査で使用）

### 6-1 count by grain/dim_type
```sql
SELECT grain, dim_type, COUNT(*) AS rows
FROM public.stats_timeseries
GROUP BY 1,2
ORDER BY 1,2;
```

### 6-2 latest generated_at
```sql
SELECT grain, dim_type, dim_key, MAX(generated_at) AS last_generated_at
FROM public.stats_timeseries
GROUP BY 1,2,3
ORDER BY last_generated_at DESC
LIMIT 100;
```

### 6-3 missing periods（all/allの例）
```sql
WITH bounds AS (
  SELECT
    MIN(period_start) AS min_ts,
    MAX(period_start) AS max_ts
  FROM public.stats_timeseries
  WHERE grain = '1d' AND dim_type = 'all' AND dim_key = 'all'
), expected AS (
  SELECT generate_series(min_ts, max_ts, interval '1 day') AS period_start
  FROM bounds
)
SELECT e.period_start
FROM expected e
LEFT JOIN public.stats_timeseries s
  ON s.period_start = e.period_start
 AND s.grain = '1d'
 AND s.dim_type = 'all'
 AND s.dim_key = 'all'
WHERE s.period_start IS NULL
ORDER BY e.period_start;
```

