# Stats v4.0 Audit Report

- 監査対象基準: `docs/stats-v4.0.checklist.md` のみ
- 監査日時: 2026-02-23
- 判定対象: 現在の実装（UI + `/api/stats` + `/api/stats/trends`）

## 総評

**FULL COMPLIANCE**

`docs/stats-v4.0.checklist.md` の全項目を再判定し、**全項目 OK** を確認しました。

---

## 判定詳細（チェックリスト順）

### Snapshot

1. **Snapshotはv3必須ブロックを完全に持つ**: **OK**  
   根拠（UIブロック）: Total Count（summary cards）/ Verification Breakdown / Chains-Assets / Category ranking / Countries ranking / Cities ranking / Asset Acceptance Matrix が実装済み。  
   - `app/(site)/stats/StatsPageClient.tsx`（summary cards, 各 SectionCard）

2. **初期表示でSnapshotは全体値を表示する**: **OK**  
   根拠（UI/API）: 初期フィルタは全て空（全体）。`buildSnapshotQuery` は空クエリを返し、`/api/stats` を条件なし取得。  
   - `app/(site)/stats/StatsPageClient.tsx`（`DEFAULT_FILTERS`, `buildSnapshotQuery`, `fetchSnapshot`）

3. **Snapshotはフィルタ条件で再集計される**: **OK**  
   根拠（APIフィールド + SQL）: `/api/stats` が `request.url` から `country/city/category/accepted/verification/promoted/source` を `parseFilters` で受理し、DB/JSON いずれもフィルタ適用集計。  
   - `app/api/stats/route.ts`（`parseFilters`, `buildFilterSql`, `responseFromPlaces`, `GET(request)`）

### Trends

4. **Trends期間セレクタを持つ（24h/7d/30d/All）**: **OK**  
   根拠（UIブロック）: 4期間ボタンをレンダリング。  
   - `app/(site)/stats/StatsPageClient.tsx`（`TREND_RANGE_OPTIONS`, period buttons）

5. **期間ごとの粒度が仕様どおり（24h=1h,7d=1d,30d=1d,All=1w or 1mo）**: **OK**  
   根拠（APIフィールド）: `RANGE_CONFIG` が `24h=1h`, `7d=1d`, `30d=1d`, `all=1w`。  
   - `app/api/stats/trends/route.ts`（`RANGE_CONFIG`）

6. **KPI推移は最低3系列を表示**: **OK**  
   根拠（APIフィールド + UIブロック）: `points` から `total`, `verified_total`, `accepting_any_total` の3系列を `LineChart` 表示。  
   - `app/(site)/stats/StatsPageClient.tsx`（`trendSeries`, `LineChart`）

7. **KPI推移は折れ線で、hover/tapで値を確認できる**: **OK**  
   根拠（UIブロック）: `LineChart` は polyline 描画に加え、`activeIndex` と hit area (`rect`) による hover/tap/click 値表示を実装。  
   - `app/(site)/stats/StatsPageClient.tsx`（`LineChart`, tooltip-like value block）

8. **内訳推移を最低1種類表示**: **OK**  
   根拠（APIフィールド + UIブロック）: `stack`（owner/community/directory/unverified）を `StackedBarChart` 表示。  
   - `app/api/stats/trends/route.ts`（`stack` 生成）
   - `app/(site)/stats/StatsPageClient.tsx`（`StackedBarChart`）

9. **Trends初期表示は7d**: **OK**  
   根拠（UI/API）: フロント初期 state は `'7d'`、APIの範囲未指定デフォルトも `'7d'`。  
   - `app/(site)/stats/StatsPageClient.tsx`（`useState<TrendRange>('7d')`）
   - `app/api/stats/trends/route.ts`（`parseRange` fallback）

10. **期間変更時はTrendsのみ再描画し、Snapshotは不変**: **OK**  
    根拠（React依存）: Trends fetch は `trendRange` 依存、Snapshot fetch は `filters` 依存で分離。  
    - `app/(site)/stats/StatsPageClient.tsx`（`useEffect` dependencies）

### Filters

11. **Filters Barはv3同等項目を持つ**: **OK**  
    根拠（UIブロック）: `country/city/category/accepted/verification/promoted/source` 全項目あり。  
    - `app/(site)/stats/StatsPageClient.tsx`（Filters `<select>` 群）

12. **フィルタはSnapshotのみに影響し、Trendsは常に全体固定**: **OK**  
    根拠（状態設計）: フィルタ変更で `fetchSnapshot(filters)` は再実行されるが、`fetchTrends` は `trendRange` 依存のみで不変。  
    - `app/(site)/stats/StatsPageClient.tsx`（`useEffect` 分離）

13. **フィルタ変更でTrends APIを再取得しない**: **OK**  
    根拠（API呼び出し条件）: `/api/stats/trends` の fetch トリガーに filters を含まない。  
    - `app/(site)/stats/StatsPageClient.tsx`（`useEffect(() => fetchTrends(trendRange), [fetchTrends, trendRange])`）

### 0件 / 失敗時

14. **Snapshot 0件時は全項目0を表示**: **OK**  
    根拠（UI/API）: `EMPTY_STATS` で0埋め、空配列時に明示メッセージ表示。  
    - `app/(site)/stats/StatsPageClient.tsx`（`EMPTY_STATS`, `EMPTY_MESSAGE`）

15. **Trends 0件時は0ラインを描画**: **OK**  
    根拠（API/UI）: API `buildEmptyResponse` が0系列を返し、UI `createEmptyTrends` でも0系列を描画可能。  
    - `app/api/stats/trends/route.ts`（`buildEmptyResponse`）
    - `app/(site)/stats/StatsPageClient.tsx`（`createEmptyTrends`, `LineChart`）

16. **Snapshot取得失敗時は直近成功キャッシュを優先表示**: **OK**  
    根拠（UI状態）: `lastSuccessfulSnapshotRef` を失敗時フォールバックに利用。  
    - `app/(site)/stats/StatsPageClient.tsx`（`fetchSnapshot`）

17. **Snapshot取得失敗でキャッシュなしの場合は0＋エラーメッセージ表示**: **OK**  
    根拠（UI表示）: キャッシュなし時 `EMPTY_STATS` + `notice` + `LimitedModeNotice`。  
    - `app/(site)/stats/StatsPageClient.tsx`（`fetchSnapshot`, `LimitedModeNotice`）

18. **Trends取得失敗時は直近成功キャッシュを優先表示**: **OK**  
    根拠（UI状態）: `lastSuccessfulTrendsRef` を range ごとに保持し再利用。  
    - `app/(site)/stats/StatsPageClient.tsx`（`fetchTrends`）

19. **Trends取得失敗でキャッシュなしの場合は0ラインを描画**: **OK**  
    根拠（UIフォールバック）: `createEmptyTrends(range)` を使用し0系列で描画。  
    - `app/(site)/stats/StatsPageClient.tsx`（`fetchTrends`, `createEmptyTrends`）

### Mobile

20. **Filtersはモバイルで折りたたみ（⚙）を提供**: **OK**  
    根拠（UIブロック）: `sm:hidden` の⚙トグルで開閉。  
    - `app/(site)/stats/StatsPageClient.tsx`（filters toggle button）

21. **Trendsはモバイルで縦1カラム表示**: **OK**  
    根拠（UIレイアウト）: Trends charts container が `space-y-4` の縦積み。  
    - `app/(site)/stats/StatsPageClient.tsx`

22. **モバイルでもデフォルト期間は7d**: **OK**  
    根拠（UI状態）: 初期 `trendRange='7d'` は共通 state のためモバイルでも7d。  
    - `app/(site)/stats/StatsPageClient.tsx`

23. **横スクロール禁止のレスポンシブ表示**: **OK**  
    根拠（UI構成）: コンテンツは `w-full` 基本、テーブルは `overflow-x-auto` で局所スクロール化。ページ全体の不要な横溢れを回避。  
    - `app/(site)/stats/StatsPageClient.tsx`

### Data/API Contract

24. **`/api/stats`はSnapshot必須フィールドを返す**: **OK**  
    根拠（APIフィールド）: `total_places`, `countries`, `cities`, `categories`, `chains` を型定義・返却。  
    - `app/api/stats/route.ts`（`StatsApiResponse`, `GET`）

25. **`/api/stats`は更新時刻を返せる（generated_at）**: **OK**  
    根拠（API/UI）: APIに `generated_at` が存在し、UIで Last updated 表示。  
    - `app/api/stats/route.ts`（`generated_at`）
    - `app/(site)/stats/StatsPageClient.tsx`（header Last updated）

26. **Trends APIは時系列点を返す（points[].date, points[].delta, points[].total）**: **OK**  
    根拠（APIフィールド）: `StatsTrendsResponse.points[]` に `date/delta/total` を含む。  
    - `app/api/stats/trends/route.ts`（`TrendSeriesPoint`, `points.push(...)`）

27. **Trends APIはv4.0前提データを満たす（3系列算出可能）**: **OK**  
    根拠（APIフィールド）: `points[]` に `verified_total` / `accepting_any_total` を同一レンジで返す。  
    - `app/api/stats/trends/route.ts`（`StatsTrendsResponse.points`, `points.push(...)`）

28. **Trends APIはキャッシュされる**: **OK**  
    根拠（HTTPヘッダ）: 正常系レスポンスに `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` を付与。  
    - `app/api/stats/trends/route.ts`（`CACHE_CONTROL`, successful `NextResponse.json` headers）

29. **Data update情報を表示（Last updated / grain / 欠損時注記）**: **OK**  
    根拠（UIブロック + APIフィールド）: Trendsカード上部に `last_updated`, `range`, `grain` 表示。`meta.reason` がある場合 note 表示。  
    - `app/(site)/stats/StatsPageClient.tsx`（Trends info line）
    - `app/api/stats/trends/route.ts`（`last_updated`, `grain`, `meta`）

### 固定ルール（v4.0）

30. **v4.0で実装しない機能を追加していない**: **OK**  
    根拠（UI/API）: フィルタ推移・複合条件推移・都市別推移切替・asset別推移切替に該当する追加切替を確認せず。  
    - `app/(site)/stats/StatsPageClient.tsx`
    - `app/api/stats/trends/route.ts`

31. **最終完成条件（5条件すべて）**: **OK**  
    根拠: 1〜30 が全て OK のため、合成条件も満たす。

---

## 結論

**FULL COMPLIANCE**
