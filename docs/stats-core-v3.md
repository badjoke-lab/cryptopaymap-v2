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

