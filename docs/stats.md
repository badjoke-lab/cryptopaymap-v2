# Stats — CryptoPayMap v2 (Authoritative)

## Appendices (legacy sources)


---

# 📄 **stats-core-v3.md — CryptoPayMap 統計コア仕様（v3.0 / 完全版）**

**Status:** Final / Implementation-Ready
**Scope:** Stats ページで扱う “現在値ベース” の統計ロジック（推移なし）
**Dependencies:**

* db-v3.0.md
* api-v3.0.md
* filters-v3.0.md
* data-etl-v3.0.md
* stats-etl-v3（後続の ETL 仕様）

---

# 1. Stats（v3）の目的

v3 の統計は **「現在 DB にある最新のデータ」だけから算出する “現時点スナップショット”**。

実装目的：

* ユーザーに「世界の暗号資産決済状況」を即時で見せる
* Map のフィルタと完全同期（country / chain / category 同期可能）
* 推移データ（v4 以降）は **一切扱わない**（別仕様書）

---

# 2. Stats ページに表示する項目（v3確定）

v3 の統計は以下の 7 ブロックで構成される：

### **S1. 総店舗数（Total Places）**

* 全 world count
* フィルタ適用時はフィルタ後 count

### **S2. 認証ステータス別内訳（Verification Breakdown）**

* owner
* community
* directory
* unverified
  → 全部％表示 + raw count

### **S3. チェーン別内訳（Chain Breakdown）**

* BTC
* Lightning
* ETH
* Polygon
* Solana
* Tron
  → 店舗が “どのチェーンを受けているか” のカウント

### **S4. カテゴリ別ランキング（Category Ranking）**

* cafe, bar, restaurant, …
  → 件数順に top10

### **S5. 国別ランキング（Country Ranking）**

* 国ごとの店舗数
  （フィルタ applied 時はフィルタ後のデータで再集計）

### **S6. 都市別ランキング（City Ranking）**

* city が存在する国のみ
  → top10

### **S7. Asset / Chain 受入件数（Asset Acceptance Matrix）**

* 行：asset（BTC, ETH…）
* 列：chain（lightning, onchain…）
  → 受け入れマトリクス

---

# 3. フィルタ同期ルール（最重要）

Stats ページは Map と同じフィルタ構造を採用し、
**URL 経由で同期する。**

例：

```
/stats?country=Japan&chain=BTC
```

**同期項目：**

* country
* city
* category
* chain
* verification

**同期されない項目（v3.0時点）**

* zoom / lat / lng（地図要素は stats では不要）

Stats ページ読み込み時：

```
1) URL クエリ読む
2) APIにそのまま渡す
3) 結果セットから統計を算出
```

---

# 4. API 設計（v3）

Stats ページが呼ぶ API は 2 種類：

### **4.1 /api/stats（v3）**

→ DB の “現在値” を元に、統計を返す。

```
GET /api/stats?country=Japan&chain=BTC
```

レスポンス：

```json
{
  "count": 248,
  "verification": {
    "owner": 32,
    "community": 44,
    "directory": 120,
    "unverified": 52
  },
  "chains": {
    "BTC": 180,
    "Lightning": 95,
    "ETH": 110,
    "Polygon": 40,
    "Solana": 15,
    "Tron": 25
  },
  "categories": [
    ["cafe", 80],
    ["restaurant", 55],
    ["bar", 30],
    ["bakery", 20]
  ],
  "countries": [
    ["Japan", 248],
    ["USA", 110],
    ["Germany", 75]
  ],
  "cities": [
    ["Tokyo", 140],
    ["Osaka", 40],
    ["Fukuoka", 20]
  ],
  "assetMatrix": {
    "BTC": { "onchain": 120, "lightning": 95 },
    "ETH": { "onchain": 110 }
  }
}
```

---

# 5. DB 参照ルール（db-v3.0 に準拠）

使うテーブル：

* `places`
* `payments`（JSONB）

### 5.1 places テーブル

利用カラム：

| カラム           | 使い方              |
| ------------- | ---------------- |
| id            | 集計のキー            |
| category      | category ranking |
| country       | country ranking  |
| city          | city ranking     |
| verification  | breakdown        |
| geometry（不使用） | statsには関係なし      |

### 5.2 payments.accepts（JSONB）

payments.accepts[].asset / chain を参照

例：

```json
{
  "accepts": [
    { "asset": "BTC", "chain": "lightning" },
    { "asset": "ETH", "chain": "onchain" }
  ]
}
```

---

# 6. 集計ロジック（SQL 例）

### **6.1 店舗総数**

```sql
SELECT COUNT(*) FROM places
WHERE <filters>;
```

### **6.2 verification breakdown**

```sql
SELECT verification, COUNT(*)
FROM places
WHERE <filters>
GROUP BY verification;
```

### **6.3 chain breakdown**

```sql
SELECT p2.asset, p2.chain, COUNT(DISTINCT p.id)
FROM places p
JOIN LATERAL jsonb_to_recordset(p.payments->'accepts')
  AS p2(asset text, chain text)
WHERE <filters>
GROUP BY p2.asset, p2.chain;
```

### **6.4 category**

```sql
SELECT category, COUNT(*)
FROM places
WHERE <filters>
GROUP BY category
ORDER BY COUNT(*) DESC
LIMIT 10;
```

---

# 7. Stats UI（v3 完全仕様）

## 7.1 PC レイアウト

```
┌──────────────────────────────┐
│ Filters bar (Map と同じ)     │
├──────────────────────────────┤
│ Total Count                  │
│ Verification Breakdown donut│
│ Chains bar-chart            │
│ Category ranking table      │
│ Countries ranking table     │
│ Cities ranking table        │
│ Asset Acceptance Matrix     │
└──────────────────────────────┘
```

## 7.2 Mobile レイアウト

縦並び・折りたたみ：

```
[ Filters ⚙ ]
Total Count
Verification Breakdown
Chains
Categories
Countries
Cities
Asset Matrix
```

---

# 8. エラーハンドリング

* 該当0件 → 全統計 0
* payments.accepts が空 → assetMatrix には含めない
* 不正フィルタ → 無視（filters-v3.0 と共通）

---

# 9. 将来拡張（v4〜v5 との関係）

| バージョン | 追加内容                                  |
| ----- | ------------------------------------- |
| v4    | 推移データ（履歴）導入 → stats-trends-v4         |
| v5    | 高度BI（時系列ダッシュボード） → stats-dashboard-v5 |

**v3 は “現在のスナップショット” のみ。
推移は一切入れない。**



---

# 📄 **stats-etl-v3.0.md — Stats ETL / Normalization 完全仕様書（v3.0）**

**Status:** Final / Implementation-Ready
**Scope:**
CryptoPayMap v2 の **DB → 統計値（Stats）** を生成するための
**ETL（Extract / Transform / Load）・集計ロジック・正規化仕様** を完全定義する。

**対象 Stats ページ（v2.0 / v2.1 / v3 基礎データ）すべての “根幹” 部分。**

---

# 1. データ源（Source of Truth）

Stats は **Neon(PostgreSQL + PostGIS)** の DB を唯一のソースとして利用する。

主要テーブル：

```
places
categories
payments
payment_accepts
socials
media
verifications
history   (v3以降)
```

（history は v3 から利用）

---

# 2. ETL の目的

Stats ETL の目的は以下：

1. DB 内のデータを、統計向けに **揺れを除去し、数え上げ可能な状態** に正規化
2. 全店舗に対し **支払手段・カテゴリ・国/都市** を集計できる状態に変換
3. Stats UI（v2.0 / v2.1 / v3）の要求を満たす **中間集計テーブル** を生成

---

# 3. ETL 実行タイミング

| フェーズ | 実行                   |
| ---- | -------------------- |
| v2.0 | 手動 or Cron（1日1回）     |
| v2.1 | Cron（6時間おき）          |
| v3   | 履歴追跡のため、**毎回差分 ETL** |

Cron は Vercel/Neon の serverless cron を利用。

---

# 4. 集計対象フィールド（正規化ルール）

## 4.1 国 / 都市（country / city）

問題：OSM や申請データには揺れがある。

例：

```
United States / USA / U.S. / America
Tokyo / Tokyo City / 東京都 / tokyo
```

### 正規化ルール

```
country_normalized = UPPER(TRIM(country))
city_normalized = INITCAP(TRIM(city))
```

さらに **正規化マッピング表**（country_aliases, city_aliases）を内包：

例：

| alias | normal        |
| ----- | ------------- |
| USA   | United States |
| U.S.  | United States |
| JP    | Japan         |
| 日本    | Japan         |

---

## 4.2 カテゴリ（category）

カテゴリは揺れが激しい。
例：
"coffee shop" / "cafe" / "café" / "Cafe" / "カフェ"

### 正規化

```
LOWER(TRIM(category))
```

次に内部マップで統合：

```
coffee shop → cafe
咖啡店 → cafe
café → cafe
```

不明なものは `other` に分類。

---

## 4.3 支払い手段（payment_accepts）

DB structure:

```
payment_accepts (
   id,
   place_id,
   asset,
   chain,
   method,
   processor,
   ...
)
```

### 正規化マップ

asset はすべて **大文字**
chain は **制御語彙にマッピング**：

```
mainnet → evm-mainnet
eth → evm-mainnet
ethereum → evm-mainnet
btc → bitcoin
btc-ln → lightning
```

禁止：

* asset と chain の対応が不正
* chain が定義外
* directory / unverified に決済情報が入っている

→ それらは ETL で除外し、エラーログに記録。

---

# 5. ETL パイプライン構造

```
extract(): DBから取得
normalize(): country, city, category, payment を正規化
aggregate(): 統計値を集計
persist(): stats_cache テーブルへ保存
```

---

# 6. 中間テーブル（stats_cache）

ETL 後は stats_cache に保存する。

```
stats_cache (
  id SERIAL PRIMARY KEY,
  generated_at TIMESTAMP,
  total_places INTEGER,
  total_countries INTEGER,
  total_cities INTEGER,
  category_breakdown JSONB,
  chain_breakdown JSONB,
  country_rank JSONB,   (v2.1)
  city_rank JSONB,      (v2.1)
  chain_country_matrix JSONB, (v3)
  chain_city_matrix JSONB     (v3)
)
```

---

# 7. 集計ロジック（v2.0 必須範囲）

## 7.1 total_places

```
SELECT COUNT(*) FROM places
WHERE status_override IS NULL;
```

---

## 7.2 total_countries

```
SELECT COUNT(DISTINCT country_normalized)
FROM places
WHERE country_normalized IS NOT NULL;
```

---

## 7.3 total_cities

```
COUNT(DISTINCT (country_normalized, city_normalized))
```

---

## 7.4 category_breakdown

```
SELECT category_normalized, COUNT(*)
FROM places
GROUP BY category_normalized
ORDER BY COUNT(*) DESC;
```

---

## 7.5 chain_breakdown

```
SELECT chain, COUNT(DISTINCT place_id)
FROM payment_accepts
GROUP BY chain
ORDER BY COUNT(*) DESC;
```

BTC と Lightning は別カウントだが
**UI 上はまとめて表示してもよい（v2.1）**。

---

# 8. 集計ロジック（v2.1 拡張）

## 8.1 国別ランキング（country_rank）

```
SELECT country_normalized, COUNT(*)
FROM places
GROUP BY country_normalized
ORDER BY COUNT(*) DESC;
```

---

## 8.2 都市別ランキング（city_rank）

```
SELECT city_normalized, country_normalized, COUNT(*)
FROM places
GROUP BY city_normalized, country_normalized
ORDER BY COUNT(*) DESC;
```

---

## 8.3 カテゴリ × チェーン（cross table）

```
SELECT category_normalized, chain, COUNT(DISTINCT place_id)
FROM payment_accepts
JOIN places USING(place_id)
GROUP BY category_normalized, chain;
```

---

# 9. v3 以降の “歴史付き Stats” の土台

これは **stats-trends-v4.md** の前段として必要。

## 9.1 history テーブルの利用

```
history (
   id,
   place_id,
   updated_at,
   field,
   old_value,
   new_value
)
```

ETL は毎回：

```
last_snapshot → 現在 → 差分を history に保存
```

---

## 9.2 日次スナップショットの生成（v4用）

```
stats_daily (
  date,
  total_places,
  total_countries,
  chain_breakdown,
  category_breakdown,
  ...
)
```

（推移グラフの元データ）

---

# 10. ETL エラー処理仕様

## 10.1 無効データ

以下は **ETL 正規化時に除外**：

* category が空 or null → `other`
* country/city が空 → country_rank/city_rank の対象外
* asset or chain が不正 → 該当行を除外
* directory/unverified の決済情報 → 強制除外
* 緯度/経度不正 → その店舗除外

---

## 10.2 エラーログ出力

```
logs/etl-errors-YYYYMMDD.json
```

* invalid payments
* unknown categories
* normalization failures
* missing fields

---

# 11. ETL 出力例（最小 v2.0）

```json
{
  "generated_at": "2025-11-25T04:20:00Z",
  "total_places": 532,
  "total_countries": 41,
  "total_cities": 128,
  "category_breakdown": {
    "cafe": 92,
    "restaurant": 80,
    "bar": 40,
    "grocery": 30,
    "other": 50
  },
  "chain_breakdown": {
    "bitcoin": 210,
    "lightning": 150,
    "evm-mainnet": 120,
    "solana": 52,
    "tron": 40
  }
}
```

---

# 12. 将来拡張（v3 → v4 → v5）

| バージョン  | 追加内容                                     |
| ------ | ---------------------------------------- |
| **v3** | cross matrix（国×チェーン / 都市×チェーン）           |
| **v4** | 推移（daily snapshots） / diff-based history |
| **v5** | BI ダッシュボード（drilldown / heatmap / 時系統分析）  |

---

# 13. Codex 実装ガイド

1. このファイルの内容を **/docs/stats-etl-v3.0.md** に保存
2. `/app/api/stats/route.ts` は **stats_cache から返すだけ**
3. `/scripts/etl/stats-etl.ts` を新規作成
4. Cron を追加
5. エラーは logs に JSON 化



---

# 📄 **stats-trends-v4.0.md — 推移データ管理仕様書（完全版 v4.0）**

**Status:** Final / Implementation-Ready
**Purpose:**
CryptoPayMap の **推移（Trend）データ**＝「日次スナップショット」「増減」「履歴管理」を
**DB で保持し、Stats v4 / v5（ダッシュボード）で使えるようにするための完全仕様書。**

---

# 1. 背景（v4 の役割）

Stats v2 / v3 は **“現在の状態”** の集計（カウント・クロステーブル）が中心。

v4 ではこれを拡張し：

### ✔ 日次スナップショット（Daily Snapshots）

### ✔ 全フィールドの増減（Diff）

### ✔ チェーン別 / カテゴリ別 / 国別の時系列推移

### ✔ 変化の発生源（増加理由 / 減少理由）

### ✔ v5（BI ダッシュボード）の前提データ

を全て扱う。

---

# 2. 全体構成（テーブル + ETL）

v4 の基礎は次の 3 テーブル：

```
stats_daily
stats_diff
history
```

ETL は以下の 3 ステップ：

```
1. 現在の stats_cache（v3）を取得
2. stats_daily に保存（スナップショット）
3. 前日との差分を計算 → stats_diff へ保存
```

---

# 3. テーブル仕様

---

## 3.1 stats_daily（必須）

**目的：**
毎日 1 回、**その日の全統計値** を保存する。

```
stats_daily (
  date DATE PRIMARY KEY,
  total_places INTEGER,
  total_countries INTEGER,
  total_cities INTEGER,

  category_breakdown JSONB,
  chain_breakdown JSONB,
  country_rank JSONB,
  city_rank JSONB,
  chain_country_matrix JSONB,
  chain_city_matrix JSONB,

  generated_at TIMESTAMP
);
```

**ルール：**

* 1 日 1 行
* 上書き禁止（既に行があったら無視 or エラー）
* データは stats_cache からそのままコピー

---

## 3.2 stats_diff（超重要）

**目的：**
**前日 → 今日の増減を機械的に記録する**
（ダッシュボードで「増加◯件」「減少◯件」を表示するため）

```
stats_diff (
  id SERIAL PRIMARY KEY,
  date DATE,           -- 今日
  field TEXT,          -- e.g. "total_places", "category:cafe", "chain:bitcoin"
  old_value JSONB,
  new_value JSONB,
  diff_value INTEGER,  -- +10, -3 など
  created_at TIMESTAMP
);
```

### diff の対象：

| 種類                   | 保存形式                 |
| -------------------- | -------------------- |
| total_places         | 数値                   |
| total_countries      | 数値                   |
| total_cities         | 数値                   |
| category_breakdown   | key ごとに差分保存          |
| chain_breakdown      | key ごとに差分保存          |
| country_rank         | key ごと               |
| city_rank            | key ごと               |
| chain_country_matrix | (country × chain) ごと |
| chain_city_matrix    | (city × chain) ごと    |

**全て “key ごと” に差分行が生成される。**

例（cafe が 92 → 95）：

```
field = "category:cafe"
old_value = 92
new_value = 95
diff_value = 3
```

---

## 3.3 history（v3 で定義済だが v4 で本格利用）

```
history (
  id SERIAL,
  place_id TEXT,
  updated_at TIMESTAMP,
  field TEXT,
  old_value TEXT,
  new_value TEXT
)
```

**用途：**
「増えた or 減った理由」を BI ダッシュボードで表示するためのデータ。

例：

* 店舗削除 → total_places が減少
* カテゴリ変更 → category_breakdown が変動
* 決済手段追加 → chain_breakdown が変動

---

# 4. ETL（推移）アルゴリズム

---

## 4.1 Step 1: stats_cache を読み込む

```
today = current_date
current = SELECT * FROM stats_cache ORDER BY generated_at DESC LIMIT 1;
```

---

## 4.2 Step 2: stats_daily に INSERT

```
INSERT INTO stats_daily (...)
VALUES (... current values ...)
ON CONFLICT DO NOTHING;
```

---

## 4.3 Step 3: 前日のスナップショット取得

```
previous = SELECT * FROM stats_daily
           WHERE date = today - 1
           LIMIT 1;
```

もし存在しなければ **初回実行** として diff 作成はスキップ。

---

## 4.4 Step 4: 差分の計算

### 4.4.1 単純数値

```
diff = current.total_places - previous.total_places
→ stats_diff に記録（diff_value = diff）
```

---

### 4.4.2 JSON breakdown 系（カテゴリ / チェーンなど）

アルゴリズム：

```
keys = set(previous.keys ∪ current.keys)

for each key:
    old = previous[key] or 0
    new = current[key] or 0
    if old != new:
        INSERT INTO stats_diff(field="category:<key>", old, new, diff=new-old)
```

---

### 4.4.3 クロステーブル（国×チェーン など）

```
for each country in union(previous, current):
  for each chain in union(previous[country], current[country]):
    same diff logic
```

---

## 4.5 Step 5: history との整合性（v4〜v5）

stats_diff には
**“何件増えた” は記録されるが “なぜ増えたか” は記録されない。**

そのため：

| 種類                 | 参照テーブル                      |
| ------------------ | --------------------------- |
| total_places の変動原因 | history(place 追加/削除)        |
| category の変動原因     | history(category 変更)        |
| chain の変動原因        | history(payment_accepts 変更) |

BI では `stats_diff + history` を組み合わせる。

---

# 5. API とデータ取得

v4 では stats ページに API が増える。

```
/api/stats/trends/daily
/api/stats/trends/diff
/api/stats/trends/chain
/api/stats/trends/category
```

返り値例：

```
{
  "date": "2025-11-25",
  "total_places": [ { "date": "...", "value": 500 }, ... ],
  "category": { "cafe": [...], "restaurant": [...] },
  "chain": { "bitcoin": [...], "evm-mainnet": [...] },
  "diff_today": [...]
}
```

---

# 6. UI（v4 対応 Stats）

v4 Stats ページは以下の UI を前提とする：

* 折れ線グラフ（Total Places）
* 棒グラフ（Category Trends）
* 積み上げ（Chain Trends）
* Country / City の増減ランキング
* 今日の差分（+◯件 / -◯件）

---

# 7. Cron（実行スケジュール）

```
毎日 00:05 UTC
```

理由：

* stats_cache の生成（v3）→ 当日中に完了している想定
* 日跨ぎ直後に安定して実行できる

---

# 8. 異常時の挙動

## 前日データがない

→ スナップショットのみ保存し、diff はスキップ。

## 形式不一致（JSON 崩れ）

→ その key の diff はスキップしログへ。

---

# 9. 将来拡張（v5 につながる部分）

Stats v5（BI ダッシュボード）では：

* 月次・週次集計
* chain dominance（支配率）
* 地域別普及速度
* 店舗カテゴリのトレンド分類（急上昇 / 安定 / 下降）
* 変化理由の自動要約（history → LLM）

この仕様がすべての基礎になる。



---

# 📄 **stats-dashboard-v5.md（CryptoPayMap 最終ダッシュボード仕様書）**

**Version:** v5.0
**Status:** Final / Implementation-ready
**Scope:**
CryptoPayMap の **統計・推移・フィルタ・BI 的可視化** を 1 画面に統合する “完全版 Stats Dashboard”。

---

# 1. ゴール（Dashboard が提供する価値）

本 Dashboard は以下を提供する：

### ✔ 1. 世界の暗号支払い動向を一目で把握

* 国別・都市別の店舗数
* ネット増減（7日 / 30日 / 90日）

### ✔ 2. 支払い手段の普及ランキング

* BTC（L / on-chain）
* ETH
* USDT（各チェーン）
* SOL / TRX / XRP など

### ✔ 3. フィルタと連動（map/filter と同じメタデータ）

* verification
* asset
* category
* country/city

### ✔ 4. v4 の “推移データ” を全て可視化

（stats-trends-v4.md で定義済みの履歴テーブルを使用）

### ✔ 5. Codex / Gemini が破綻しないように **API を完全分離**

---

# 2. 画面レイアウト（PC / Mobile）

## 2.1 PC（3 カラム）

```
┌──────────────────────────────────────────────┐
│ Header (Stats / About / Last Update)         │
├──────────────────────────────────────────────┤
│ [左] Summary Cards（5枚）                     │
│ [中] Charts（推移折れ線 / 円グラフ / 棒グラフ） │
│ [右] Ranking（国別 / asset別 / chain別）       │
├──────────────────────────────────────────────┤
│ Footer（データ提供元 / 更新時刻）             │
└──────────────────────────────────────────────┘
```

## 2.2 Mobile（縦 1 カラム）

すべて縦に並ぶ：

```
Summary Cards → Charts → Ranking → Footer
```

---

# 3. Summary Cards（5 枚）

全て v3 スナップショット API `/api/stats` 利用。

### S1: Total Locations

```
**12,531**
worldwide entries
```

### S2: Verified Ratio

owner + community / total

### S3: Top Asset

例:

```
BTC (Lightning) – 4,981 stores
```

### S4: 7d Net Change

```
+128 stores (past 7 days)
```

### S5: Country Leader

例：

```
United States – 3,021 stores
```

**色テーマ：**

| type     | color               |
| -------- | ------------------- |
| positive | #16A34A (Green-600) |
| negative | #DC2626 (Red-600)   |
| neutral  | #6B7280 (Gray-500)  |

---

# 4. Charts（完全仕様）

## 4.1 推移折れ線（メインチャート）

**ソース:** `/api/stats/trends?period=90d`

表示：

* total locations（90日推移）
* net change（前日比）
* verified / unverified 推移

**仕様：**

* X-axis：日付（毎日）
* Y-axis：店舗数
* Tooltip：当日の各値を表示
* 色：

  * Total：#2563EB（Blue-600）
  * Verified：#16A34A
  * Unverified：#9CA3AF

---

## 4.2 支払い手段シェア（円グラフ）

**ソース:** `/api/stats/assets`

```
BTC (L)
BTC (on-chain)
ETH
USDT (Polygon)
USDT (Tron)
SOL
XRP
```

---

## 4.3 カテゴリ別バー（棒グラフ）

**ソース:** `/api/stats/categories`

上位 10 カテゴリのみ表示。

---

# 5. Rankings（国・都市・資産）

## 5.1 国別ランキング

**ソース:** `/api/stats/countries`
上位 20 まで。

表示項目：

* 国名
* 店舗数
* 前週比（↑↓）

## 5.2 都市別ランキング

**ソース:** `/api/stats/cities`

## 5.3 Asset別普及ランキング

**ソース:** `/api/stats/assets`

---

# 6. API 要件（Dashboard 専用の新規追加）

既存 API を壊さないように v5 で追加。

## 6.1 `/api/stats/trends`

```
?period=7d|30d|90d|180d|365d
```

レスポンス例：

```json
{
  "period": "90d",
  "data": [
    { "date": "2025-08-01", "total": 10221, "verified": 5221, "unverified": 5000 },
    ...
  ]
}
```

## 6.2 `/api/stats/countries`

## 6.3 `/api/stats/assets`

## 6.4 `/api/stats/categories`

---

# 7. パフォーマンス要件

* すべて ISR / キャッシュ 24h
* “Net Change” のみリアルタイム（60秒キャッシュ）

---

# 8. UI 仕様（詳細）

### 8.1 Summary card animation

* fade-in (150ms)
* count-up 数字アニメ（0.25秒）

### 8.2 Charts

* rechart.js or chart.js
* touch ズーム OK（モバイル）

### 8.3 Ranking table

* スクロール固定ヘッダー
* クリックで並べ替え

---

# 9. モック（PC / Mobile）

## PC

```
Total Locations  | Trend Chart 90d    | Country Ranking
Verified Ratio   | Asset Pie Chart    | City Ranking
Top Asset        | Category Bar Chart | Asset Ranking
Net Change (7d)
Top Country
```

## Mobile

```
[Summary Cards]
[Trend Chart]
[Asset Pie]
[Category Bar]
[Rankings]
```

---

# 10. 実装順（Codex / Gemini 共通）

1. `/api/stats/trends` 作成
2. `/api/stats/countries`
3. `/api/stats/assets`
4. `/api/stats/categories`
5. Dashboard UI Scaffold
6. Summary Cards
7. Charts
8. Rankings
9. 最終レイアウト調整



---

# 📄 **data-etl-v3.0.md — ETL / Normalization 仕様書（最終版）**

**Version:** v3.0
**Status:** Final / Implementation-ready
**Scope:** JSON → PostgreSQL(PostGIS) の完全 ETL / Normalizer 仕様
**対象データ:**
owner / community / directory / unverified
（`antarctica.json` など既存 JSON 全て）

---

# 1. ETL 全体フロー（確定）

```
[1] JSON Raw
       ↓
[2] importer (schema validation)
       ↓
[3] normalizer (補正 / 変換)
       ↓
[4] geocoder (lat/lng 不足時)
       ↓
[5] DB writer（places / assets / hours / media / verifications）
       ↓
[6] snapshot builder（stats v3 用）
```

---

# 2. Raw JSON → importer（バリデーション）

## 2.1 必須フィールド

| field        | type   | rule                              |           |           |             |
| ------------ | ------ | --------------------------------- | --------- | --------- | ----------- |
| id           | string | `cpm:<country>-<city>-<slug>-<n>` |           |           |             |
| name         | string | 1〜120 chars                       |           |           |             |
| country      | string | ISO 国名（例：Japan）                   |           |           |             |
| city         | string | 1〜80 chars                        |           |           |             |
| address      | string | 任意、空でも可                           |           |           |             |
| verification | enum   | `owner                            | community | directory | unverified` |
| accepted     | array  | 配列化必須                             |           |           |             |
| coordinates  | object | lat/lng どちらも存在（不足は geocoder）      |           |           |             |
| category     | string | 1語以上                              |           |           |             |

---

# 3. Normalizer（統一処理）

## 3.1 category 揺れ補正

入力例：
`Cafe`, `cafe`, `Cafe / Coffee`, `coffee-shop`

→ 正規化後：

```
cafe
```

**ルール：**

```
lowercase → trim → split(/[,/]/) → 第一要素を採用
```

---

## 3.2 payment.accepts 統一（最重要）

入力（raw）例：

```
BTC
btc
Bitcoin
Bitcoin (Lightning)
BTC Lightning
```

→ 正規化後：

```
BTC@Lightning
```

### 正規化マッピング表

| Raw                          | Normalized    |
| ---------------------------- | ------------- |
| BTC, Bitcoin                 | BTC@onchain   |
| Lightning, BTC Lightning, LN | BTC@Lightning |
| ETH, Ethereum                | ETH@onchain   |
| USDT (Polygon), USDT-Polygon | USDT@Polygon  |
| USDT (Tron), USDT-TRX        | USDT@Tron     |
| SOL, Solana                  | SOL@main      |
| XRP                          | XRP@main      |

### アローチェーン決定ロジック

```
if includes("lightning") → BTC@Lightning
else if includes("polygon") → USDT@Polygon
else if includes("tron") → USDT@Tron
else fall back to onchain
```

---

## 3.3 media（画像）

### 許容形式

```
.jpg .jpeg .png .webp
```

### directory / unverified の画像ゼロ制約

* directory / unverified → `media: []` に強制上書き
  （画像が入っていても削除）

### owner / community

* 0〜10 枚
* URL が存在しない場合 → 空配列

---

## 3.4 coordinates（緯度経度）

```
if lat/lng present:
    keep
else:
    geocode (Nominatim or Google)
```

緯度経度の丸め：

```
round to 6 decimals
```

---

## 3.5 hours（営業情報）

Raw:

```
"hours": {
  "mon": "07:00-20:00",
  "tue": "",
  "wed": null
}
```

→ 正規化後：

```
[
  { "day": "mon", "open": "07:00", "close": "20:00" },
  { "day": "tue", "open": null, "close": null },
  ...
]
```

---

# 4. importer → normalizer の中間形式（完全定義）

```ts
type NormalizedPlace = {
  id: string
  name: string
  country: string
  city: string
  address: string | null
  verification: "owner" | "community" | "directory" | "unverified"
  category: string
  accepts: string[]        // ["BTC@Lightning", "ETH@onchain"]
  media: string[]          // URLs
  coordinates: { lat: number, lng: number }
  hours: Array<{ day: string, open: string|null, close: string|null }>
  contact: {
    website?: string
    phone?: string
    x?: string
    instagram?: string
    facebook?: string
  }
}
```

---

# 5. DB Writer（PostgreSQL/PostGIS）

## 5.1 places

| col          | type                  | note       |
| ------------ | --------------------- | ---------- |
| id           | text (PK)             | raw ID     |
| name         | text                  |            |
| country      | text                  |            |
| city         | text                  |            |
| address      | text                  | null       |
| verification | text                  | enum       |
| category     | text                  | normalized |
| geom         | geometry(Point, 4326) | lat/lng    |

---

## 5.2 assets（many-to-many）

```
place_id (FK)
asset (text)   // BTC@Lightning 等
```

---

## 5.3 media

```
place_id
url
index
```

---

## 5.4 hours

```
place_id
day (mon–sun)
open
close
```

---

## 5.5 verifications

owner → 1
community → 2
directory → 0
unverified → -1

```
place_id
level
timestamp
```

---

# 6. スクリプト構成（importer / normalizer / writer）

```
scripts/
 ├ importer.ts
 ├ normalizer.ts
 ├ writer.ts
 ├ geocode.ts
 └ main-etl.ts
```

## main-etl.ts

```
const raw = loadJsonFiles()
const imported = raw.map(importer)
const normalized = imported.map(normalizer)
const geo = await geocodeMissing(normalized)
await writer(geo)
await buildSnapshot()
```

---

# 7. エラー処理（完全版）

| 種類              | 動作            |
| --------------- | ------------- |
| id 欠落           | スキップ + ログ     |
| verification 不正 | スキップ          |
| category 空白     | `"other"` に強制 |
| accepts 不正      | 空配列に強制        |
| media 不正URL     | 除外            |
| hours 不正        | null 行に置換     |
| geocoder 失敗     | 警告 + スキップ     |

---

# 8. snapshot builder（/api/stats v3 用）

* 国別集計
* 都市別集計
* カテゴリ別集計
* asset別集計
* verification 4段階
* 7d / 30d 用の net-change を生成（後で trends v4 が吸収）

キャッシュ形式：

```
snapshots/stats-v3.json
snapshots/assets-v3.json
snapshots/countries-v3.json
snapshots/cities-v3.json
```

---

# 9. テストデータ（antarctica / tokyo など）

**投入順は都市名のアルファベット順でロード**

```
antarctica.json
japan-tokyo.json
usa-newyork.json
```

---

# 10. Codex / Gemini 用アクション

## 10.1 Forbidden

* 現行 DB を壊す migration
* schema 変更
* verification レベル名変更
* accepts マッピング変更

## 10.2 Allowed

* importer / normalizer / writer のみ改良
* スナップショット生成ロジック
* 新規 stats API の実装（独立 API Routes）

