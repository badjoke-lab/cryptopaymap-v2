# 🧱 Stats v4.1 仕様（What = 何を持つか）

## 0. 目的

* Snapshot（現状）とTrends（推移）の**両方が同一フィルタ条件で一貫する**。
* 「この条件の世界は、今どうで、どう増減してきたか」が見える。

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

---

## C. Trends（v4.1強化）

## C-1. 期間セレクタ（必須）

* 24h（1h粒度）
* 7d（1d粒度）
* 30d（1d粒度）
* All（1w or 1mo）

---

## C-2. KPI推移（必須）

フィルタ適用後の：

1. Total count
2. Verified count
3. Accepting any crypto

→ すべて**フィルタ後母集団の時系列**

---

## C-3. 内訳推移（必須）

フィルタ適用後の：

* Verification スタック推移
* Top5 Categories 推移
* Top5 Countries 推移
* Top5 Assets 推移

※Top5は「期間合計上位」で固定

---

## C-4. 複合フィルタ推移（重要）

v4.1は以下を許可：

* country=DE の推移
* category=fast_food の推移
* asset=BTC の推移
* country=DE AND category=fast_food
* country=DE AND asset=BTC
* category=fast_food AND asset=BTC
* country=DE AND category=fast_food AND asset=BTC

※ただし保存済みキューブに存在する組み合わせのみ正確表示

---

## D. データ更新表示（必須）

* Last updated
* 対応していない組合せ時の注記

---

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

* APIはキャッシュ前提
* フィルタ変更時のみ再取得
* 同一条件は再利用

---

# 8. モバイル挙動

* Filters 折りたたみ
* Trends縦表示
* デフォルト7d
* タップでツールチップ固定

---

# 📊 データ前提（v4.1）

以下のdim_typeが保存済みであること：

* **all**
* verification
* country
* city
* category
* asset
* chain
* promoted
* source

さらに組合せdim：

* country|category
* country|asset
* category|asset
* country|city
* country|category|asset（任意）

---

# 🚫 v4.1でやらないこと

* リアルタイム秒単位更新
* 無制限多次元キューブ保存
* 任意条件のオンデマンド重SQL

---

# 🎯 v4.1 完成条件

* フィルタとTrendsが完全一致
* 単一フィルタ推移が正確
* 対応複合フィルタが正確
* 非対応組合せは明示表示
* 0件でも壊れない
* API失敗でも真っ白にならない

---
