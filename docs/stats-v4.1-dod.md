# Stats v4.1 DoD（Definition of Done）固定チェックリスト

最終更新: 2026-02-27  
対象仕様（正本）: `docs/stats-v4.1.md`

---

## 判定ルール（全項目共通）

- **PASS**: 「検証方法」に書いたコマンド・URL・UI操作・SQLで、期待値をすべて満たす。
- **FAIL**: 期待値のいずれか1つでも満たさない。
- **PARTIAL**: 実装はあるが、仕様の一部のみ満たす（例: fallbackはあるが required dim が不足）。
- **N/A**: 「任意（将来）」項目で、未導入が仕様上許容されている。

---

## 必須（v4.1完成条件）

### A. データ生成（stats_timeseries）

- [ ] A-1 1h生成は「直近48h再計算 + UPSERT冪等」。
  - 検証方法:
    - コード: `lib/stats/generateTimeseries.ts` の `runStatsTimeseriesJob("hourly")` 呼び出しと `sinceHours`、`ON CONFLICT ... DO UPDATE` を確認。
    - コマンド: `pnpm tsx scripts/generate_stats_timeseries.ts --grain=1h --since-hours=48`
    - SQL: 同一bucket再実行後に行数増加ではなく更新であることを確認。
  - PASS基準: `sinceHours=48` が適用され、PK衝突時 update される。

- [ ] A-2 1d生成は「前日確定（UTC基準）」。
  - 検証方法:
    - コード: `resolveWindow(grain=1d)` が `today(UTC)` の前日を対象にするか確認。
    - コマンド: `pnpm tsx scripts/generate_stats_timeseries.ts --grain=1d`
  - PASS基準: ウィンドウが `[昨日00:00Z, 今日00:00Z)`。

- [ ] A-3 1w生成は「週次集約（週境界が明確）」。
  - 検証方法:
    - コード: `startOfUtcWeek` の週開始定義を確認。
    - コマンド: `pnpm tsx scripts/generate_stats_timeseries.ts --grain=1w`
  - PASS基準: 週開始定義（UTC月曜始まり）がコードで固定される。

- [ ] A-4 保存dim（必須範囲）: `all / verification / country(topN) / category(topN) / asset(topN)`。
  - 検証方法:
    - コード: `buildRows` 内 `toRows` 呼び出しのdim_type一覧。
    - SQL: `SELECT grain, dim_type, COUNT(*) FROM public.stats_timeseries GROUP BY 1,2 ORDER BY 1,2;`
  - PASS基準: 必須dim_typeが全grainで存在。

- [ ] A-5 複合dim: `country|category / country|asset / category|asset`（3複合は任意）。
  - 検証方法:
    - コード: `buildRows` の複合生成有無。
    - SQL: `SELECT DISTINCT dim_type FROM public.stats_timeseries WHERE dim_type LIKE '%|%';`
  - PASS基準: 2複合3種が保存対象に含まれる。

- [ ] A-6 保存対象制限（全組合せ禁止）が守られる。
  - 検証方法:
    - コード: topN制限、`COMPOSITE_DIM_WITHIN_PARENT_LIMIT`、候補キー生成ロジック。
  - PASS基準: 無制限全組合せ保存ロジックが存在しない。

- [ ] A-7 breakdown_json shape が仕様どおり（verification + breakdowns + top list）。
  - 検証方法:
    - コード: `buildBreakdownJson`。
    - SQL: `SELECT breakdown_json FROM public.stats_timeseries WHERE dim_type='all' ORDER BY period_start DESC LIMIT 1;`
  - PASS基準: `verification` と `breakdowns`（category/asset/country）を保持。

- [ ] A-8 generated_at 更新整合。
  - 検証方法:
    - コード: upsertで `generated_at = EXCLUDED.generated_at`。
    - SQL: 再実行前後で `generated_at` が更新されることを確認。
  - PASS基準: upsert update 時に generated_at が更新される。

### B. Cron運用（Hobby制約）

- [ ] B-1 Vercel cron は daily 1本。
  - 検証方法: `vercel.json` の `crons` を確認。
  - PASS基準: daily schedule 1件のみ。

- [ ] B-2 dailyハンドラ内で hourly/daily/weekly相当をまとめて実行。
  - 検証方法: `app/api/internal/cron/stats-timeseries/route.ts` を確認。
  - PASS基準: 1リクエスト内で hourly + daily +（週次日だけweekly）実行。

- [ ] B-3 secret認可、`no-store`、ログ出力。
  - 検証方法: 同routeの認可・header・console出力。
  - PASS基準: secret不一致403、レスポンス no-store、開始/完了/失敗ログがある。

- [ ] B-4 失敗時戻り値とログ可読性。
  - 検証方法: catchで返すJSONの `error` と log prefix を確認。
  - PASS基準: 500時に `ok:false` + エラー理由 + duration が返る。

### C. API（`/api/stats/trends`）

- [ ] C-1 range→grain 固定: `24h=1h / 7d=1d / 30d=1d / all=1w`。
  - 検証方法: `RANGE_CONFIG` と `GET` 内適用。
  - PASS基準: 4rangeすべて固定マップ。

- [ ] C-2 保存キューブ参照のみ（重いオンデマンド集計なし）。
  - 検証方法: SQLが `public.stats_timeseries` 参照のみか確認。
  - PASS基準: history/payment_accepts/verificationsの重集計が無い。

- [ ] C-3 データ無しを判別可能（`meta.has_data` など）。
  - 検証方法: no data時レスポンスを確認。
  - PASS基準: has_data=false と reason/missing_reason を返す。

- [ ] C-4 fallback戦略（`used`/`requested`/`fallback`）と嘘禁止メタ返却。
  - 検証方法: candidate選択ロジックとmetaを確認。
  - PASS基準: requestedと異なるcube利用時に dropped filter が明示される。

- [ ] C-5 `last_updated / grain / used cube` 返却。
  - 検証方法: レスポンス本体とmeta確認。
  - PASS基準: 3要素が常に返る。

### D. UI（Stats）

- [ ] D-1 Filters変更がTrendsに連動し、rangeは維持。
  - 検証方法: `fetchTrends(trendRange, filters)` の依存配列と range state を確認。
  - UI操作: rangeを30dへ変更→filter変更→rangeが30dのまま再取得される。
  - PASS基準: filter変更でも range state が保持される。

- [ ] D-2 fallback時は必ず明示（代替表示 + dropped filters）。
  - 検証方法: fallbackバナー表示条件。
  - PASS基準: `meta.fallback.applied=true` で警告表示。

- [ ] D-3 更新情報表示（Last updated / grain / cube）。
  - 検証方法: Trends header表示文言。
  - PASS基準: 3要素が同時表示される。

- [ ] D-4 失敗/欠損/0件で真っ白禁止。
  - 検証方法: zero-baseline生成、警告表示、snapshot empty表示。
  - PASS基準: チャートは0ライン表示、警告が出る。

- [ ] D-5 直近成功キャッシュ（導入済み）注記が正しい。
  - 検証方法: localStorage cache + TTL + banner。
  - PASS基準: API失敗時に24h以内キャッシュを明示利用。

- [ ] D-6 Top5凡例固定（導入済み）仕様どおり。
  - 検証方法: API top5 keys + UI legend固定表記。
  - PASS基準: range内合計top5でkeys固定。

### E. 互換性/回帰

- [ ] E-1 Statsページが500にならない。
  - 検証方法: `pnpm dev` で `/stats` 表示、または `pnpm build`。
  - PASS基準: ビルド/表示で致命エラーなし。

- [ ] E-2 既存API `/api/stats` へ影響なし。
  - 検証方法: `curl /api/stats` が既存形式で応答。
  - PASS基準: スキーマ互換を保持。

- [ ] E-3 モバイル（360px）崩れなし。
  - 検証方法: ブラウザ devtools 360px で `/stats` を目視。
  - PASS基準: Filters/Trends/Snapshot のレイアウト破綻なし。

---

## 任意（将来）

- [ ] O-1 `country|category|asset`（3複合）を保存キューブ化。
- [ ] O-2 warm cache（TTL24h / LRU1000）をサーバ側で実装。
- [ ] O-3 `city / chain / promoted / source` の時系列キューブ化（仕様の曖昧点解消後）。
- [ ] O-4 Top5 kind を category固定から country/assetへの動的切替仕様を正式化。

