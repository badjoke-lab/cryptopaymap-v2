# Stats v4.1 差分監査レポート（現状 vs v4.1仕様）

- 監査基準: `docs/stats-v4.1.md` + チャット追記仕様（更新間隔・保存キューブ・保存テーブル・Core Cube/Warm Cache・Hourly/Daily/Weekly job）。
- 監査対象: `app/(site)/stats/StatsPageClient.tsx`, `app/api/stats/route.ts`, `app/api/stats/trends/route.ts`, 関連 `lib/**`, `scripts/**`, `migrations/**`。

## 0. 重大ブロッカー（最上位）

1. **Trendsがフィルタ非連動（Snapshotと同一条件になっていない）** — **BLOCKER / NG**  
   根拠: フロントは Trends 呼び出し時に `range` のみを送っており、filtersを送っていない。`safeFetch('/api/stats/trends?range=${range}')`。`/api/stats` は filters をクエリに載せる実装。`/api/stats/trends` 側も `range` しか解釈していない。【app/(site)/stats/StatsPageClient.tsx:509-517,540-542 / app/api/stats/trends/route.ts:92-99】
2. **Trendsが保存済みキューブ参照ではなく、リクエスト毎にhistoryを重SQL集計している** — **BLOCKER / NG**  
   根拠: `app/api/stats/trends/route.ts` で `public.history` / `verifications` / `payment_accepts` を CTE + 集計で都度計算し、`stats_timeseries` 等の保存テーブル参照がない。【app/api/stats/trends/route.ts:198-205,246-286】
3. **v4.1で必須の保存テーブル/キューブ/ジョブ運用が未確認（実装実体なし）** — **BLOCKER / NG**  
   根拠: 実装が参照しているのは `stats_cache`（snapshot補助）で、Trends保存テーブルは未使用。Hourly/Daily/Weeklyバッチ実装・設定も監査対象コード上に見当たらない。【app/api/stats/route.ts:751-757 / app/api/stats/trends/route.ts:157-365】

> 注: 「docsに追記仕様が未反映」ブロッカーは**該当なし**。更新間隔・保存方式・テーブル・キューブ・ジョブ・Warm Cacheが `docs/stats-v4.1.md` に明記済み。【docs/stats-v4.1.md:63-95,273-347】

---

## 1. チェックリスト判定（OK / Partial / NG）

## 1) Snapshot
| 項目 | 判定 | 根拠 |
|---|---|---|
| Snapshot主要KPI表示 | **OK** | Snapshot APIは total/verification/chains-assets/rankings/matrix を返し、UI側に対応セクションが存在。【app/api/stats/route.ts:25-52,602-615 / app/(site)/stats/StatsPageClient.tsx:872-975】 |
| フィルタ変更時の即時再集計 | **OK** | filters state 変更で `fetchSnapshot(filters)` が走り、`/api/stats` を再取得。【app/(site)/stats/StatsPageClient.tsx:570-579,607-609,519-523】 |

## 2) Trends
| 項目 | 判定 | 根拠 |
|---|---|---|
| 期間セレクタ + 粒度(24h/7d/30d/all → 1h/1d/1d/1w) | **OK** | UIに4レンジがあり、API `RANGE_CONFIG` が仕様粒度を返す。【app/(site)/stats/StatsPageClient.tsx:98-103,847-860 / app/api/stats/trends/route.ts:44-49】 |
| KPI推移（total/verified/accepting_any） | **OK** | Trends API `points` に3KPIがあり、フロント折れ線系列として描画。【app/api/stats/trends/route.ts:29-34,311-319 / app/(site)/stats/StatsPageClient.tsx:614-629,864】 |
| 内訳推移（verification stack） | **OK** | `stack` をAPI返却し、UIで積み上げ表示。【app/api/stats/trends/route.ts:35,320-326 / app/(site)/stats/StatsPageClient.tsx:868】 |
| 内訳推移（Top5 category/country/asset） | **NG** | Trends API型/レスポンスに Top5系フィールドが存在しない。UIにも該当グラフなし。【app/api/stats/trends/route.ts:25-37,330-336 / app/(site)/stats/StatsPageClient.tsx:838-870】 |
| TopN固定（期間合計上位固定） | **NG** | Trendsロジックは単一時系列集計のみで TopN抽出・固定凡例処理がない。【app/api/stats/trends/route.ts:246-327】 |

## 3) Filters
| 項目 | 判定 | 根拠 |
|---|---|---|
| Filters Barの項目網羅 | **OK** | `country/city/category/accepted/verification/promoted/source` を保持しUI入力あり。【app/(site)/stats/StatsPageClient.tsx:67-75,785-818】 |
| Snapshot/Trends 同一フィルタ適用 | **NG** | Snapshotのみフィルタ付きでAPI呼び出し。Trendsは `range` のみ。Trends API側もfilter受理なし。【app/(site)/stats/StatsPageClient.tsx:509-517,540-542 / app/api/stats/trends/route.ts:92-99】 |
| 複合フィルタ非対応時の代替キューブ＋明示 | **NG** | Trends APIにキューブ選択/フォールバック次元の概念がなく、UIにも「非対応組合せ」注記ロジックがない（`meta.reason` はDB状態のみ）。【app/api/stats/trends/route.ts:36,336-337 / app/(site)/stats/StatsPageClient.tsx:844-846】 |

## 4) 0件 & 失敗時挙動
| 項目 | 判定 | 根拠 |
|---|---|---|
| 0件時: Snapshot全0、Trends 0ライン | **OK** | Snapshot/Trends とも空時に0データ構築あり。UIも空白ではなく表示継続。【app/(site)/stats/StatsPageClient.tsx:117-158,611-613 / app/api/stats/trends/route.ts:129-155】 |
| 欠損時: 直近成功キャッシュ優先、無ければ0＋警告 | **Partial** | フロントは last successful を保持し失敗時利用。Trends APIも空データ+meta返却。ただし v4.1想定の保存キューブ/ウォームキャッシュ経由の復旧ではない。【app/(site)/stats/StatsPageClient.tsx:504-506,521-546,755-770,844-846 / app/api/stats/trends/route.ts:346-363】 |

## 5) 更新間隔
| 項目 | 判定 | 根拠 |
|---|---|---|
| 24h: 1時間更新 + 48h再計算 | **NG** | 時間バッチ/再計算実装ではなく、リクエスト時集計。`Cache-Control` は5分再検証で仕様の「1時間ごと更新」と別物。【app/api/stats/trends/route.ts:39,157-365】 |
| 7d/30d: 日次1回更新 | **NG** | 日次確定ジョブは見当たらず、都度クエリで生成。【app/api/stats/trends/route.ts:157-365】 |
| all: 週次1回更新 | **NG** | 週次ジョブ実装なし。`all` も同じ都度集計経路。【app/api/stats/trends/route.ts:44-49,157-365】 |

## 6) キューブ & 保存
| 項目 | 判定 | 根拠 |
|---|---|---|
| 保存済みキューブ参照（オンデマンド重SQL禁止） | **NG** | `history`起点の動的集計SQLを実行している。【app/api/stats/trends/route.ts:256-286】 |
| `stats_timeseries`相当テーブル設計 | **NG** | 実装コードに `stats_timeseries` 参照なし。既存参照は `stats_cache` のみ（snapshot用途）。【app/api/stats/route.ts:751-757】 |
| Core Cube（単一TopN + 一部複合） | **NG** | dim_type/dim_key でのキューブ管理・TopN保存定義がコード上にない。【app/api/stats/trends/route.ts:157-365】 |
| Warm Cache（TTL24h/LRU1000） | **NG** | Trends向けTTL/LRUキャッシュ実装が存在しない。APIは毎回DB集計、UIの直近成功保持のみ。【app/api/stats/trends/route.ts:246-286 / app/(site)/stats/StatsPageClient.tsx:504-506】 |

## 7) ジョブ運用
| 項目 | 判定 | 根拠 |
|---|---|---|
| Hourly Job（毎時・48h再計算） | **NG** | 関連ジョブ処理が実装経路に存在せず、TrendsはGET時集計のみ。【app/api/stats/trends/route.ts:157-365】 |
| Daily Job（日次確定・TopN再計算） | **NG** | 日次バッチ/TopN再計算処理が確認できない。【app/api/stats/trends/route.ts:157-365】 |
| Weekly Job（週次集約） | **NG** | 週次集約ジョブ実装が確認できない。【app/api/stats/trends/route.ts:157-365】 |

## 8) API契約
| 項目 | 判定 | 根拠 |
|---|---|---|
| v4.1必要メタ（Last updated, grain, cube種別,非対応注記） | **Partial** | `last_updated` と `grain` は返すが、`使用キューブ種別` と `非対応組合せ注記` はAPI契約にない。【app/api/stats/trends/route.ts:25-37,330-337 / app/(site)/stats/StatsPageClient.tsx:843-846】 |
| Trends APIがフィルタ入力を受理 | **NG** | `parseRange` のみ実装、filter受理なし。【app/api/stats/trends/route.ts:92-99】 |

## 9) Mobile
| 項目 | 判定 | 根拠 |
|---|---|---|
| Filters折りたたみ | **OK** | `filtersOpen` と `sm:hidden` のトグル実装あり。【app/(site)/stats/StatsPageClient.tsx:501,775-785】 |
| Trends縦表示 | **Partial** | チャートは縦積み（`space-y-4`）だが、仕様で求めるモバイル最適化要件の定義（専用レイアウト/情報量調整）は限定的。【app/(site)/stats/StatsPageClient.tsx:863-869】 |
| デフォルト7d | **OK** | 初期 state が `'7d'`。【app/(site)/stats/StatsPageClient.tsx:502】 |
| タップでツールチップ固定 | **OK** | `onClick` トグル / `onTouchStart` があり固定可能。【app/(site)/stats/StatsPageClient.tsx:355-367】 |

---

## 2. 総括

- **v4.1達成度（実装観点）**: Snapshot周辺は概ね成立。ただし **Trends基盤はv4.1要件に対して未達が中心**。特に「フィルタ一致」「保存キューブ参照」「更新ジョブ」「保存テーブル」「Top5内訳推移」が欠落。
- **仕様逸脱の性質**: 多くが「未実装」ではなく、**実装方針そのものがv4.1と逆（オンデマンド集計）**。

---

## 3. v4.1完成に必要な作業（WorkItems）

1. **Trends APIにフィルタ入力契約を追加**  
   - `country/city/category/accepted/verification/promoted/source` を受理する query schema を定義。  
   - Snapshotと同じフィルタ正規化を共通化。
2. **`stats_timeseries`（or同等）保存テーブルを新設**  
   - 仕様列: `period_start/period_end/grain/dim_type/dim_key/total_count/verified_count/accepting_any_count/breakdown_json/generated_at`。  
   - PK: `(period_start, grain, dim_type, dim_key)`。
3. **Core Cube 事前計算パイプラインを実装**  
   - 単一軸: `all/verification/country/category/asset` のTopN保存。  
   - 複合: `country|category`, `country|asset`, `category|asset`, `country|category|asset(任意)`。
4. **Hourly Job実装（毎時）**  
   - 1h grain を直近48h再計算し、表示は24hを返す。  
   - 確定済みバケットの再計算ポリシーを実装に反映。
5. **Daily Job実装（日次）**  
   - 1d grain 前日確定。  
   - 7d/30d向け TopN 再計算をこのジョブで確定。
6. **Weekly Job実装（週次）**  
   - 1w grain を生成し All に提供。
7. **Trends APIを保存済みキューブ read path に置換**  
   - `history` 直接集計SQLを撤去し、保存テーブル参照のみで応答。  
   - レスポンスに `cube_type` / `fallback_applied` / `unsupported_combination_note` を追加。
8. **未保存複合条件向け Warm Cache導入**  
   - 条件: 保存キューブ不在時のみ生成。  
   - 制約: TTL=24h / LRU=1000 / 保存キューブ優先。
9. **Trends内訳拡張（Top5 category/country/asset）**  
   - 期間合計TopN固定ロジックを追加し、期間中の凡例不変を保証。
10. **UI注記表示の強化**  
    - `使用キューブ種別` と `非対応組合せ（代替適用）` を Trendsヘッダに表示。
11. **受け入れテスト追加**  
    - フィルタ一致（Snapshot=Trends条件）、0件時挙動、障害時フォールバック、更新間隔（job起因）をE2E/APIテストで固定。

