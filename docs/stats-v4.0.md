# 🧱 Stats v4.0 仕様（What = 何を持つか）

## 1. 目的

* 「現在の全体像（Snapshot）」＋「全体の推移（Trends）」を表示する。
* 推移は**フィルタ非依存（常に全体）**。
* Mapとフィルタは連動するが、**Trendsは全体固定**。

---

## 2. 画面構成（必須ブロック）

## A. Filters Bar（既存v3と同じ）

* country
* city
* category
* accepted（asset/chain）
* verification
* promoted
* source など

→ Snapshotにのみ影響

---

## B. Snapshot セクション（v3相当）

1. Total Count
2. Verification Breakdown（donut）
3. Chains / Assets（bar）
4. Category ranking table
5. Countries ranking table
6. Cities ranking table
7. Asset Acceptance Matrix

※完全にv3仕様を継承

---

## C. Trends セクション（v4.0追加）

### C-1. 期間セレクタ（必須）

* 24h（1h粒度）
* 7d（1d粒度）
* 30d（1d粒度）
* All（1w or 1mo粒度）

---

### C-2. KPI 推移（必須）

最低限この3系列：

1. Total places（総数）
2. Verified places
3. Accepting any crypto（accepts非空）

形式：

* 折れ線グラフ
* 同一グラフに複数線でも可
* hover/tapで値表示

---

### C-3. 内訳推移（最低1つは必須）

* Verification のスタック推移
  または
* Top5 Categories 推移
  または
* Top5 Countries 推移

（最小構成なら verification stack だけでもOK）

---

## D. データ更新情報（必須）

* Last updated: yyyy-mm-dd hh:mm
* grain 表示（1h/1d/1w）
* 欠損時の注記

---

# ⚙️ Stats v4.0 挙動（How = どう動くか）

---

## 1. 初期表示

* Filters：デフォルト（全体）
* Snapshot：全体値
* Trends：デフォルト 7d 表示

---

## 2. Filters操作時

### 2.1 Snapshot

* フィルタ条件で再集計される

### 2.2 Trends

* **一切変わらない**
* 常に全体推移を表示

（これが v4.0 の明確な線引き）

---

## 3. 期間変更時（Trends）

* Trendsのみ再描画
* Snapshotは変更なし

---

## 4. データ取得失敗時

### Snapshot失敗

* 直近成功キャッシュを表示
* なければ「0」＋エラーメッセージ
* 真っ白禁止

### Trends失敗

* 直近成功キャッシュ表示
* それも無ければ 0ライン描画

---

## 5. 0件時

Snapshot:

* 全項目 0

Trends:

* 0ラインを描画

NaNや空白は禁止

---

## 6. パフォーマンス挙動

* Trends APIはキャッシュ必須
* 期間変更時のみ再取得
* フィルタ変更では再取得しない

---

## 7. モバイル挙動

* Filters 折りたたみ（⚙）
* Trendsは縦1カラム
* デフォルト 7d
* 横スクロール禁止（レスポンシブ）

---

# 📊 データ前提（v4.0）

Trendsは以下のみ使う：

dim_type='**all**'
dim_type='verification'
dim_type='asset'（AcceptingAny算出用）

→ フィルタ別時系列は持たない（v4.1で追加）

---

# 🚫 v4.0で「やらないこと」

* フィルタ推移
* 複合条件推移
* 都市別推移切替
* asset別推移切替

---

# 🎯 v4.0 完成条件

* Snapshotがv3完全準拠
* Trends 24h/7d/30d/Allが切替可能
* フィルタでTrendsが変わらない
* 0件でも壊れない
* API失敗で真っ白にならない

---

