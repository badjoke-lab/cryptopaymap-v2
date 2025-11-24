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

