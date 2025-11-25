# 📄 **api-v3.0.md — API 最終仕様書（v3.0 / 完全版）**

**Status:** Final
**Audience:** Codex / Gemini / Owner
**Scope:**
CryptoPayMap v2 の **全 API**（REST）を App Router 構成で完全定義。
DB は Neon（PostgreSQL + PostGIS）既存スキーマを利用。

---

# 1. API 全体設計方針

* Next.js App Router の **Route Handlers** を使用 (`app/api/**/route.ts`)
* レスポンス形式は **JSON / typed**
* CORS はデフォルト（同一オリジン）
* エラーフォーマットはすべて統一：

```
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Place not found"
  }
}
```

* キャッシュ方針

  * `/api/places` → `revalidate: 300`（5分）
  * `/api/stats` → `revalidate: 7200`（2時間）
  * `/api/filters/meta` → `revalidate: 3600`（1時間）

---

# 2. API Routes 一覧

| Route                   | 用途                 |
| ----------------------- | ------------------ |
| `GET /api/places`       | 地図用の全店舗取得（軽量版）     |
| `GET /api/places/[id]`  | 個別店舗詳細（Drawer 用）   |
| `GET /api/stats`        | v3 コア統計（Stats ページ） |
| `GET /api/filters/meta` | UI フィルタ用メタデータ      |
| `GET /api/search`       | v2.1 予定の検索API      |
| `GET /api/history/[id]` | v4 設計：店舗の推移データ取得   |

---

# 3. 型定義（完全版）

## 3.1 Place（軽量版：Map 用）

```
{
  id: string
  name: string
  lat: number
  lng: number
  verification: "owner" | "community" | "directory" | "unverified"
  category: string
  city: string
  country: string
  accepted: string[]   // BTC / ETH / USDT@Polygon …
}
```

## 3.2 PlaceDetail（Drawer 用）

```
{
  id: string
  name: string
  verification: "owner" | "community" | "directory" | "unverified"
  category: string
  city: string
  country: string

  about: string
  about_short: string

  hours: string[] | null
  payments: {
    assets: string[]
    pages: string[]
  } | null

  contact: {
    website: string | null
    phone: string | null
    x: string | null
    instagram: string | null
    facebook: string | null
  } | null

  amenities: string[] | null

  media: string[]   // photos: owner/community only

  location: {
    address1: string | null
    address2: string | null
    lat: number
    lng: number
  }
}
```

## 3.3 Stats v3

```
{
  total_places: number
  countries: number
  cities: number
  categories: number
  chains: {
    BTC: number
    LIGHTNING: number
    ETH: number
    USDT: number
    ...others
  }
}
```

## 3.4 Meta filters

```
{
  categories: string[]
  chains: string[]
  countries: string[]
  cities: string[]
}
```

---

# 4. GET `/api/places`（Map 用）

## 4.1 Description

地図描画のための **軽量データのみ** 返す。
Drawer / Popup の重いデータは返さない。

## 4.2 Query Parameters

| Key            | 説明                                         |
| -------------- | ------------------------------------------ |
| `country`      | 国フィルタ                                      |
| `city`         | 都市                                         |
| `category`     | カテゴリ                                       |
| `chain`        | 支払い通貨                                      |
| `verification` | owner / community / directory / unverified |

全部 optional。
複数指定 → `?chain=BTC&chain=ETH`

## 4.3 Response Example

```
[
  {
    "id": "cpm:antarctica:owner-cafe-1",
    "name": "Antarctica Owner Café",
    "lat": -77.845,
    "lng": 166.667,
    "verification": "owner",
    "category": "cafe",
    "city": "McMurdo Station",
    "country": "AQ",
    "accepted": ["BTC", "BTC@Lightning", "ETH"]
  }
]
```

---

# 5. GET `/api/places/[id]`（Drawer 用）

## 5.1 Description

Drawer ページ（右側 / bottom-sheet）の **完全詳細**。

## 5.2 Response

`PlaceDetail` の完全型。

---

# 6. GET `/api/stats`（v3 核心統計）

## 6.1 Description

Stats v3 で必要な「コア統計」を返す。
集計ロジックは `stats-core-v3.md` に準拠。

## 6.2 Response Example

```
{
  "total_places": 1290,
  "countries": 84,
  "cities": 310,
  "categories": 22,
  "chains": {
    "BTC": 540,
    "LIGHTNING": 430,
    "ETH": 300,
    "USDT": 120
  }
}
```

---

# 7. GET `/api/filters/meta`

## 7.1 Description

UI のフィルター（ドロップダウンなど）を表示するためのメタ情報。

## 7.2 Response

```
{
  "categories": [...],
  "chains": [...],
  "countries": [...],
  "cities": [...]
}
```

---

# 8. GET `/api/search`（v2.1 仕様）

## 8.1 Description

簡易検索（名前・カテゴリ・都市）の全文検索。

## 8.2 Query

| Key | Example |
| --- | ------- |
| `q` | crypto  |

## 8.3 Response

```
[
  { id, name, city, country, verification }
]
```

---

# 9. GET `/api/history/[id]`（v4 推移用 API）

Stats Trends（v4）と連動。

## Response

```
{
  "id": "...",
  "history": [
    { "date": "2025-01-01", "value": 3 },
    { "date": "2025-02-01", "value": 4 },
    ...
  ]
}
```

---

# 10. エラー形式（全API共通）

```
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Place not found"
  }
}
```

---

# 11. 実装上のルール（Codex 用）

### Forbidden

* DB migration の生成
* verification 名の変更
* accepted の正規化ロジック変更
* v1 コード参照

### Required

* すべて typed
* 全 API に input validate
* 404 / 400 / 500 のエラー統一

---

# 12. API 完成条件（チェックリスト）

| 項目                  | 条件                    |
| ------------------- | --------------------- |
| `/api/places`       | 200 / フィルタ動作 / 軽量返却   |
| `/api/places/[id]`  | Drawer 全項目が null なく取得 |
| `/api/stats`        | v3 core の全項目一致        |
| `/api/filters/meta` | カテゴリ・チェーンの揺れなし        |
| `/api/search`       | OR / 部分一致対応           |
| `/api/history/[id]` | v4 では未使用だが API だけ実装   |

