# Stats v4.0 Audit Report

- 監査対象基準: `docs/stats-v4.0.checklist.md` のみ
- 監査日時: 2026-02-23
- 判定対象: 現在の実装（UI + `/api/stats` + `/api/stats/trends`）

## 総評

**NOT COMPLIANT**

未達（NG）項目が存在します。特に以下が致命的です。

- Snapshot フィルタ再集計が未実装（UIはクエリを送るが API 側が受理していない）
- Trends 初期期間が 7d ではなく 30d
- Trends の hover/tap での値確認（tooltip等）が未実装
- Trends の Data update 情報（grain/欠損注記）表示が未実装
- Trends API 契約（`points[].date`,`points[].delta`,`points[].total`）未充足

---

## 判定詳細（チェックリスト順）

### Snapshot

1. **Snapshotはv3必須ブロックを完全に持つ**: **OK**  
   根拠: UI上で Total Count（summary cards）/ Verification Breakdown / Chains-Assets / Category ranking / Countries ranking / Cities ranking / Asset Acceptance Matrix の各ブロックが実装されている。  
   - UIブロック: summary cards, `Verification Breakdown`, `Chains / Assets`, `Rankings`, `Asset Acceptance Matrix`  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L772-785, L817-920

2. **初期表示でSnapshotは全体値を表示する**: **OK**  
   根拠: 初期フィルタが全空文字（全体）で、`/api/stats` をクエリなしで取得する。  
   - 参照: `DEFAULT_FILTERS` と初期 state、fetch 呼び出し  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L105-113, L446-456, L554-556, L468

3. **Snapshotはフィルタ条件で再集計される**: **NG**  
   不足タスク: **TASK3（Filters）** の API 連動変更不足。  
   根拠: UI は `country/city/category/accepted/verification/promoted/source` をクエリ化して `/api/stats?...` を呼ぶが、`/api/stats` 側に `request.url` / `searchParams` の解釈処理が存在せず、集計 SQL/JSON fallback もフィルタ非対応。  
   - UI: `buildSnapshotQuery` + fetch  
   - API: フィルタパラメータ受理処理なし  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L456-464, L468
   - 参照: `app/api/stats/route.ts` L577-620（GET は request 引数なし）

### Trends

4. **Trends期間セレクタを持つ（24h/7d/30d/All）**: **OK**  
   根拠: 4つの期間ボタンが実装済み。  
   - UIブロック: Trends period buttons  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L96-101, L792-805

5. **期間ごとの粒度が仕様どおり（24h=1h,7d=1d,30d=1d,All=1w or 1mo）**: **OK**  
   根拠: Trends API の `RANGE_CONFIG` が仕様どおり（All=1w）。  
   - APIフィールド: `grain`  
   - 参照: `app/api/stats/trends/route.ts` L41-46

6. **KPI推移は最低3系列を表示**: **OK**  
   根拠: `total_series` / `verified_series` / `accepting_any_series` を LineChart で表示。  
   - APIフィールド: `series.total_series`, `series.verified_series`, `series.accepting_any_series`  
   - UIブロック: Trends line chart + legend  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L558-579, L809

7. **KPI推移は折れ線で、hover/tapで値を確認できる**: **NG**  
   不足タスク: **TASK2（Trends UX）** のインタラクション実装不足。  
   根拠: 折れ線（SVG polyline）はあるが、point marker/tooltip/hoverハンドラ実装がない。  
   - UIブロック: `LineChart`  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L289-299（polylineのみ）

8. **内訳推移を最低1種類表示**: **OK**  
   根拠: `verification_stacked_series` による stacked chart を表示。  
   - APIフィールド: `series.verification_stacked_series`  
   - UIブロック: Verification stack  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L561, L810-814

9. **Trends初期表示は7d**: **NG**  
   不足タスク: **TASK2（Trends期間初期値）** の変更不足。  
   根拠: 初期 state が `'30d'`。API 側のデフォルト range も `'30d'`。  
   - 参照: `app/(site)/stats/StatsPageClient.tsx` L449
   - 参照: `app/api/stats/trends/route.ts` L95

10. **期間変更時はTrendsのみ再描画し、Snapshotは不変**: **OK**  
    根拠: `trendRange` 変更で `fetchTrends` のみ再実行。Snapshot は `filters` 依存で別管理。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L550-556

### Filters

11. **Filters Barはv3同等項目を持つ**: **OK**  
    根拠: `country/city/category/accepted/verification/promoted/source` すべて UI 実装。  
    - UIブロック: Filters  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L733-767

12. **フィルタはSnapshotのみに影響し、Trendsは常に全体固定**: **NG**  
    不足タスク: **TASK3（Filters→Snapshot再集計）** の実装不足。  
    根拠: Trends はフィルタ非連動で固定だが、Snapshot 側も実質不変（APIでフィルタ未解釈）なため「Snapshotのみ変化」を満たさない。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L468, L550-556
    - 参照: `app/api/stats/route.ts` L577-620

13. **フィルタ変更でTrends APIを再取得しない**: **OK**  
    根拠: Trends fetch は `trendRange` 依存のみ。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L550-552

### 0件 / 失敗時

14. **Snapshot 0件時は全項目0を表示**: **OK**  
    根拠: `EMPTY_STATS` で 0 初期化し、空データ表示文言も実装。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L115-139, L102, L233-235, L873-874, L916-918

15. **Trends 0件時は0ラインを描画**: **OK**  
    根拠: Trends API `buildEmptyResponse` が各 bucket を 0 埋めし、LineChart 描画に渡す。  
    - APIフィールド: `series.total_series`, `series.verified_series`, `series.accepting_any_series`  
    - 参照: `app/api/stats/trends/route.ts` L126-147
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L558-579, L809

16. **Snapshot取得失敗時は直近成功キャッシュを優先表示**: **OK**  
    根拠: `lastSuccessfulSnapshotRef` を利用し、失敗時にフォールバック。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L451, L470, L473-475

17. **Snapshot取得失敗でキャッシュなしの場合は0＋エラーメッセージ表示**: **OK**  
    根拠: キャッシュなし時 `EMPTY_STATS`、かつ `notice` を設定して LimitedModeNotice + Retry 表示。  
    - UIブロック: LimitedModeNotice  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L470, L477, L704-719

18. **Trends取得失敗時は直近成功キャッシュを優先表示**: **OK**  
    根拠: `lastSuccessfulTrendsRef` を range ごとに保持し、失敗時フォールバック。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L452, L492, L495-497

19. **Trends取得失敗でキャッシュなしの場合は0ラインを描画**: **OK**  
    根拠: `createEmptyTrends(range)` へフォールバック（0系列）。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L141-151, L492

### Mobile

20. **Filtersはモバイルで折りたたみ（⚙）を提供**: **OK**  
    根拠: `sm:hidden` の⚙ボタンで開閉。  
    - UIブロック: Filters mobile toggle  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L724-730

21. **Trendsはモバイルで縦1カラム表示**: **OK**  
    根拠: Trends 内は `space-y-4` で縦積み。  
    - UIブロック: Trends charts container  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L808-814

22. **モバイルでもデフォルト期間は7d**: **NG**  
    不足タスク: **TASK5（Mobile default period）** ではなく実質 **TASK2** の初期値未変更。  
    根拠: 初期 `trendRange='30d'` は画面幅に依らず共通。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L449

23. **横スクロール禁止のレスポンシブ表示**: **OK（実装上）**  
    根拠: 全体レイアウトはレスポンシブで、Charts は `w-full`。表は `overflow-x-auto` で要素内スクロールに閉じる設計。  
    - UIブロック: table wrapper / chart svg  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L273, L854-855, L888-889

### Data/API Contract

24. **`/api/stats`はSnapshot必須フィールドを返す**: **OK**  
    根拠: `total_places`, `countries`, `cities`, `categories`, `chains` を型定義・返却。  
    - APIフィールド: 上記5キー  
    - 参照: `app/api/stats/route.ts` L16-23, L540-547

25. **`/api/stats`は更新時刻を返せる（generated_at）**: **OK**  
    根拠: API型に `generated_at` があり、cache由来で設定。UI側でも Last updated 表示。  
    - APIフィールド: `generated_at`  
    - UIブロック: Last updated  
    - 参照: `app/api/stats/route.ts` L41, L165, L564-567
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L661, L701

26. **Trends APIは時系列点を返す（points[].date, points[].delta, points[].total）**: **NG**  
    不足タスク: **TASK6（API contract）** のレスポンス互換変更不足。  
    根拠: 現行は `series.total_series[]` 等であり、`points[]` / `delta` / `total` 形式ではない。  
    - APIフィールド: `series.total_series`, `series.verified_series`, `series.accepting_any_series`  
    - 参照: `app/api/stats/trends/route.ts` L24-34, L27-32

27. **Trends APIはv4.0前提データを満たす（3系列算出可能）**: **OK**  
    根拠: Total/Verified/AcceptingAny の3系列が同一レンジで返却される。  
    - APIフィールド: `series.total_series`, `series.verified_series`, `series.accepting_any_series`  
    - 参照: `app/api/stats/trends/route.ts` L27-31, L316-319

28. **Trends APIはキャッシュされる**: **OK**  
    根拠: `Cache-Control` を返し、UI側は期間変更でのみ再取得。  
    - 参照: `app/api/stats/trends/route.ts` L36, L327
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L550-552

29. **Data update情報を表示（Last updated / grain / 欠損時注記）**: **NG**  
    不足タスク: **TASK6（Trends data-update表示）** の UI 表示不足。  
    根拠: Snapshot の Last updated はあるが、Trends領域に `grain` 表示および欠損注記表示がない。  
    - APIフィールド: `grain`, `meta.reason` は存在  
    - UIブロック: Trends card に該当表示なし  
    - 参照: `app/api/stats/trends/route.ts` L26, L33
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L787-815

### 固定ルール（v4.0）

30. **v4.0で実装しない機能を追加していない**: **OK**  
    根拠: フィルタ推移/複合条件推移/都市別推移切替/asset別推移切替のUI/APIは見当たらない。  
    - 参照: `app/(site)/stats/StatsPageClient.tsx` L787-815
    - 参照: `app/api/stats/trends/route.ts` L149-345

31. **最終完成条件（5条件すべて）**: **NG**  
    不足タスク: **TASK2 / TASK3 / TASK6** 未達。  
    根拠: 9, 3, 26, 29 の NG が残存しているため、総合条件を満たさない。

---

## 未達タスク一覧（TASK1〜6）

- **TASK2（Trends）**
  - 初期期間を 7d に変更不足（現状 30d）
  - hover/tap 値表示（tooltip等）不足
- **TASK3（Filters）**
  - Snapshot API 側でフィルタ条件反映不足（UIクエリ送信はあるが再集計されない）
- **TASK6（Data/API Contract）**
  - Trends API の `points[].date/delta/total` 形式への整合不足
  - Trends Data update表示（Last updated / grain / 欠損注記）不足

