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

