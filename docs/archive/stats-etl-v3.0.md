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

