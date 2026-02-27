# 🧱 Stats v4.1 仕様（What = 何を持つか）【完全版】

---

## 0. 目的

* Snapshot（現状）とTrends（推移）の**両方が同一フィルタ条件で一貫する**。
* 「この条件の世界は、今どうで、どう増減してきたか」が見える。
* v4.1では、Trendsは保存済みスナップショット（事前計算キューブ）を基盤とする。
* 重いオンデマンドSQLは禁止し、事前計算による安定表示を優先する。

---

# 1. 画面構成

## A. Filters Bar（Mapと同一）

* country
* city
* category
* accepted（asset / chain）
* verification
* promoted
* source

→ Snapshot と Trends の両方に影響

---

## B. Snapshot（v3互換）

変更なし：

* Total
* Verification donut
* Chains/Assets
* Category / Country / City ranking
* Asset Matrix

Snapshotはフィルタ変更時に即時再集計される。

---

# C. Trends（v4.1強化）

---

## C-1. 期間セレクタ（必須）

* 24h（1h粒度）
* 7d（1d粒度）
* 30d（1d粒度）
* All（1w粒度）

---

# 🔁 C-1a. スナップショット生成間隔

Trendsは事前計算済みキューブを参照する。

---

### ■ 24h（1h粒度）

* 保存粒度：1時間
* 更新間隔：**1時間ごと**
* 再計算範囲：直近48時間
* 表示は直近24時間のみ
* 過去確定時間は再計算しない

---

### ■ 7d / 30d（1d粒度）

* 保存粒度：1日
* 更新間隔：**1日1回**
* 更新タイミング：UTC日次バッチ
* 過去確定日は再計算しない

---

### ■ All（1w粒度）

* 保存粒度：1週間
* 更新間隔：**週1回**
* 長期傾向確認用途

---

# ■ 保存方式（必須）

* DBに保存されたキューブを参照
* APIは保存済みデータのみ返却
* オンデマンド重SQLは禁止
* 保存済みキューブに存在する組合せのみ正確表示

---

## C-2. KPI推移（必須）

フィルタ適用後の：

1. Total count
2. Verified count
3. Accepting any crypto

---

## C-3. 内訳推移（必須）

フィルタ適用後の：

* Verification スタック推移
* Top5 Categories 推移
* Top5 Countries 推移
* Top5 Assets 推移

※Top5は期間合計上位固定

---

## C-4. 複合フィルタ推移

許可：

* country
* category
* asset
* country+category
* country+asset
* category+asset
* country+category+asset

存在しない組合せは代替表示＋明示

---

# D. データ更新表示

表示：

* Last updated
* 使用粒度（1h / 1d / 1w）
* 使用キューブ種別
* 非対応組合せ注記

---

# ⚙️ 挙動（How）
# ⚙️ Stats v4.1 挙動（How = どう動くか）

---

# 1. 初期表示

* Filters：全体
* Snapshot：全体
* Trends：全体7d

---

# 2. Filters変更時

### Snapshot

* 即時再集計

### Trends

* 同じフィルタ条件で再取得
* 期間は維持
* 保存済みキューブが存在しない場合は代替キューブを使用

---

# 3. フィルタ別の具体挙動

## 3.1 単一フィルタ

例：
country=DE

→ TrendsはDEのみの時系列になる

---

## 3.2 複合フィルタ（AND条件）

例：
country=DE
category=fast_food

挙動：

* 対応キューブが存在 → 正確推移表示
* 存在しない → 最も近い次元を使用（例：countryのみ）＋明示表示

「嘘の推移」は絶対に出さない

---

# 4. TopN推移の決定方法

* 期間内の合計値でランキング決定
* 期間中に順位が変動しても凡例は固定

---

# 5. 0件時

Snapshot：

* 全0

Trends：

* 0ライン

空白禁止

---

# 6. データ欠損時

* 直近成功キャッシュ使用
* 無ければ 0ライン＋警告表示

---

# 7. パフォーマンス挙動

* APIは保存済みキューブを参照
* 24hは1時間ごと更新
* 7d/30dは日次更新
* Allは週次更新
* 同一条件はキャッシュ再利用

---

# 8. モバイル挙動

* Filters 折りたたみ
* Trends縦表示
* デフォルト7d
* タップでツールチップ固定

---

# 📊 データ前提（v4.1）

保存済みdim_type：

* all
* verification
* country
* city
* category
* asset
* chain
* promoted
* source

組合せdim：

* country|category
* country|asset
* category|asset
* country|city
* country|category|asset（任意）

---

# 🗄 追加：データ保存設計（v4.1新規）

## 1. 保存テーブル構造

### stats_timeseries

| column              | type           | 説明                                |
| ------------------- | -------------- | --------------------------------- |
| period_start        | timestamp      | バケット開始                            |
| period_end          | timestamp      | バケット終了                            |
| grain               | enum(1h,1d,1w) | 粒度                                |
| dim_type            | text           | 次元種別                              |
| dim_key             | text           | 次元値                               |
| total_count         | int            | 総数                                |
| verified_count      | int            | verified数                         |
| accepting_any_count | int            | Accepting any数                    |
| breakdown_json      | jsonb          | 内訳（verification/category/assetなど） |
| generated_at        | timestamp      | 生成時刻                              |

Primary Key:

```
(period_start, grain, dim_type, dim_key)
```

---

## 2. Core Cube（事前保存対象）

単一ディメンション：

* country（上位N）
* category（上位N）
* asset（上位N）
* verification
* all

複合ディメンション：

* country|category
* country|asset
* category|asset
* country|category|asset（任意）

※全組合せは保存しない

---

## 3. 更新ジョブ仕様

### Hourly Job（毎時）

* 対象：1h粒度
* 更新：直近48時間
* 処理時間目標：< 2分

### Daily Job（日次）

* 対象：1d粒度
* 前日分を確定
* TopN再計算

### Weekly Job（週次）

* 対象：1w粒度
* 長期集約

---

## 4. Warm Cache（補助）

* 未保存の複合条件が要求された場合のみ生成
* TTL：24時間
* LRU上限：1000キー
* 保存済みキューブを優先

---

# 🚫 v4.1でやらないこと

* 秒単位更新
* 無制限キューブ保存
* 重い動的集計

---

# 🎯 v4.1 完成条件

* フィルタとTrends完全一致
* 更新間隔が仕様通り
* 事前計算のみで表示
* 0件でも壊れない
* 非対応条件は明示

---

---

## 🛠 Stats timeseries 運用（PR-10）

- Backfill は安全デフォルトで実行する（全期間デフォルト禁止）。
  - `1h`: 既定48時間
  - `1d`: 既定7日
  - `1w`: 既定8週
- 推奨コマンド:
  - `pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1d --days=90`
  - `pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1w --weeks=52`
  - `pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1h --hours=48`
- 欠損検知コマンド:
  - `pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1h --hours=48 --dim-type=all --dim-key=all --fail-if-gaps-above=0`
  - `pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1d --days=90 --dim-type=all --dim-key=all --fail-if-gaps-above=0`
  - `pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1w --weeks=52 --dim-type=all --dim-key=all --fail-if-gaps-above=0`
- stale 判定しきい値:
  - `1h`: period/generated の遅延が3時間超
  - `1d`: period/generated の遅延が48時間超
  - `1w`: period/generated の遅延が14日超
- 保持方針（削除実装は別PR）:
  - `1h`: 最大60日
  - `1d`: 最大2年
  - `1w`: 最大5年
