# Stats v4.1 監査チェックリスト

基準: `docs/stats-v4.1.md` + 追加仕様（24h=1h更新、7d/30d=日次、all=週次、Trendsは保存キューブ参照、`stats_timeseries` 相当、Core Cube + Warm Cache、Hourly/Daily/Weekly job方針）。

## 1) Snapshot
- [ ] Snapshot主要KPI（Total / Verification donut / Chains/Assets / Category・Country・City ranking / Asset Matrix）が取得・表示される。  
  確認方法: `app/api/stats/route.ts` のレスポンス構造と `app/(site)/stats/StatsPageClient.tsx` の描画セクションを突合。
- [ ] Snapshotがフィルタ変更時に即時再集計される。  
  確認方法: `StatsPageClient` の filter state 変更と `/api/stats` 再取得トリガーを確認。

## 2) Trends
- [ ] 期間セレクタが `24h/7d/30d/all` を提供し、粒度が `1h/1d/1d/1w` になる。  
  確認方法: `StatsPageClient` の range UI と `app/api/stats/trends/route.ts` の `RANGE_CONFIG` を確認。
- [ ] KPI推移（total / verified / accepting_any）が返却・表示される。  
  確認方法: Trends APIの `points` フィールド定義とフロントの折れ線シリーズ生成を確認。
- [ ] 内訳推移（verification stack / Top5 category / Top5 country / Top5 asset）が返却・表示される。  
  確認方法: Trends APIレスポンス型と UI セクションを確認。
- [ ] TopN固定ロジック（期間合計上位固定）が実装される。  
  確認方法: Trends集計SQLまたは整形ロジックで期間合計TopN固定処理の有無を確認。

## 3) Filters
- [ ] Filters Bar が `country/city/category/accepted/verification/promoted/source` を提供する。  
  確認方法: `StatsPageClient` のフィルタstateとUIコントロールを確認。
- [ ] 同一フィルタ条件が Snapshot と Trends の両方に適用される。  
  確認方法: `/api/stats` と `/api/stats/trends` 呼び出しパラメータ、およびTrends API側のフィルタ処理有無を確認。
- [ ] 複合フィルタ（許可組合せ）で非対応時に代替キューブ＋明示表示を行う。  
  確認方法: Trends APIのキューブ選択ロジックと UI 注記表示を確認。

## 4) 0件 & 失敗時挙動
- [ ] 0件時: Snapshotは全0、Trendsは0ライン（空白禁止）。  
  確認方法: 空レスポンス/フォールバック時データ構築ロジックとUI描画を確認。
- [ ] データ欠損/DB障害時: 直近成功キャッシュを優先、無ければ0ライン＋警告。  
  確認方法: フロント/APIの失敗時フォールバックと notice/meta 表示を確認。

## 5) 更新間隔
- [ ] 24h（1h粒度）は1時間ごと更新、直近48h再計算で24h表示。  
  確認方法: スケジューラ/ジョブ実装、更新対象期間ロジック、データ更新時刻の扱いを確認。
- [ ] 7d/30d（1d粒度）は日次1回更新。  
  確認方法: 日次ジョブまたは同等バッチ定義を確認。
- [ ] all（1w粒度）は週次1回更新。  
  確認方法: 週次ジョブまたは同等バッチ定義を確認。

## 6) キューブ & 保存
- [ ] TrendsがDB保存済みキューブのみを参照し、オンデマンド重SQLを実行しない。  
  確認方法: `/api/stats/trends` のクエリ内容が保存テーブル read-only か確認。
- [ ] `stats_timeseries`（または同等）に `grain/dim_type/dim_key + total/verified/accepting_any + generated_at` が保存される。  
  確認方法: migration/DDL/ORM定義の有無を確認。
- [ ] Core Cube（単一軸TopN + 一部複合）が事前保存対象として定義されている。  
  確認方法: 集計対象次元の定義コードや設定ファイルを確認。
- [ ] Warm Cache（TTL=24h, LRU=1000）が未保存複合条件でのみ使われる。  
  確認方法: キャッシュ実装のキー戦略・容量制限・TTLと適用条件を確認。

## 7) ジョブ運用
- [ ] Hourly Job（毎時, 1h粒度, 直近48h再計算）がある。  
  確認方法: cron/queue/worker 実装と処理範囲ロジックを確認。
- [ ] Daily Job（日次, 1d粒度確定, TopN再計算）がある。  
  確認方法: 日次ジョブ実装とTopN再計算処理の有無を確認。
- [ ] Weekly Job（週次, 1w粒度集約）がある。  
  確認方法: 週次ジョブ実装を確認。

## 8) API契約
- [ ] `/api/stats` と `/api/stats/trends` が v4.1の必要フィールドを返す（last_updated, grain, cube種別/非対応注記など）。  
  確認方法: route のレスポンス型定義と実際の `NextResponse.json` ペイロードを確認。
- [ ] Trends APIがフィルタ入力を受け取り、適用結果を返す。  
  確認方法: query params の受理、SQL/参照ロジックへの反映を確認。

## 9) Mobile
- [ ] Filters折りたたみ、Trends縦表示、デフォルト7d、タップでツールチップ固定が満たされる。  
  確認方法: `StatsPageClient` のモバイルUIクラス・初期state・interaction handler を確認。
