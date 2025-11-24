# 📄 **filters-v3.0.md — CryptoPayMap v3 フィルタ仕様書（完全版）**

**Status:** Final / Implementation-Ready
**Scope:** Map ページのフィルタ UI / API / 動作仕様
**Audience:** Codex / Gemini / Manual Developer
**Dependencies:**

* ui-map-v3.x
* api-v3.0
* db-v3.0

---

# 1. Overview — 何を実現するフィルタか

CryptoPayMap のフィルタは **Map 表示・Pin 取得・Stats 同期**をすべて統括する。

**コア目的：**

1. ユーザーが求める店舗だけを素早く抽出
2. Map の重さを抑え、DB/API 負荷を最小化
3. PC / Mobile 双方で統一挙動
4. Stats（統計）との同期が可能な構造

---

# 2. フィルタ項目一覧（v3.0 完成版）

| フィルタ              | UI                | クエリパラメータ             | API対応 | 備考                                         |
| ----------------- | ----------------- | -------------------- | ----- | ------------------------------------------ |
| カテゴリ              | Select / Dropdown | `category=`          | ✔     | 25カテゴリ固定（v3.0）                             |
| チェーン（asset/chain） | Multi-checkbox    | `chain=`             | ✔     | (`BTC`, `Lightning`, `ETH`, …)             |
| 認証ステータス           | Multi-checkbox    | `verification=`      | ✔     | owner / community / directory / unverified |
| 国                 | Dropdown + 検索     | `country=`           | ✔     | DB の存在値のみ                                  |
| 都市                | Dropdown（国に連動）    | `city=`              | ✔     | DB の存在値のみ                                  |
| 表示件数制限（サーバ側）      | hidden            | `limit=`             | ✔     | 初期は1200件                                   |
| 地域ズーム             | UIなし（内部）          | `lat=`, `lng=`, `z=` | 地図と同期 | url sync                                   |

---

# 3. UI 仕様（PC / Mobile 両方）

## 3.1 PC UI（横長バー）

```
┌──────────────────────────────────────────────┐
│ Category [▼] | Chain [multi] | Verification [multi] | Country [▼] | City [▼] │
└──────────────────────────────────────────────┘
```

**デザイン：**

* 高さ：48px
* 背景：`#FFFFFF`
* ボーダー：`#E5E7EB`
* gap：12px
* overflow-x：自動（カテゴリ多い場合）

---

## 3.2 Mobile UI（折りたたみ・2段）

```
[ Filters ⚙ ]   ← タップ
──────────────
Category [▼]
Chain [multi]
Verification [multi]
Country [▼]
City [▼]
──────────────
```

* トグル式アコーディオン
* モーダルではなく画面内に挿入
* 選択中は [ Filters ••• ] と点表示

---

# 4. 各フィルタの仕様

---

## 4.1 Category

### UI

* Dropdown
* 最大25項目
* `Other` は対象外（directory 流入は手動設定されているため）

### クエリ

```
?category=cafe
```

### API

`/api/places?category=cafe`

### DB

`category` カラム（string）
揺れ補正は ETL 側（data-etl-v3）で実施済みとする。

---

## 4.2 Chain（asset + chain）

Map では
**“asset + chain” のセットを簡略表示した一段フィルタ** にする。

例：

* BTC
* Lightning
* ETH
* Polygon
* Solana
* Tron
* BSC
  など。

### UI

Multi-checkbox＋タグ式

例：

```
[✔] BTC
[ ] Lightning
[✔] ETH
[ ] Polygon
```

### クエリ

```
?chain=BTC&chain=ETH
```

### API

`/api/places?chain[]=BTC&chain[]=ETH`
（内部では payment.accepts[].asset / chain と OR マッチ）

---

## 4.3 Verification

4段階すべて使用：

* owner
* community
* directory
* unverified

### UI

Multi-checkbox

### クエリ

```
?verification=owner&verification=community
```

### API

`/api/places?verification[]=owner&verification[]=community`

---

## 4.4 Country

### UI

* Dropdown
* 上位20件を上に、それ以下はスクロール
* 文字検索つき

### クエリ

```
?country=Japan
```

### Country 選択時の自動挙動

* city フィルタをその国の都市一覧に絞る
* Map を国中心に自動ズーム（zoom = 4〜5）

---

## 4.5 City（Country に連動）

### UI

* Dropdown
* Country 選択時に動的ロード
* Country が未選択 → city フィルタは disabled

### クエリ

```
?city=Tokyo
```

### API

`/api/places?country=Japan&city=Tokyo`

---

# 5. URL / 状態同期（最重要）

CryptoPayMap のフィルタは
**UI状態 ⇄ URLクエリ ⇄ API** が完全同期する。

例：

```
/map?category=cafe&chain=BTC&country=Japan&city=Tokyo
```

これが MapShell の useEffect に流れ、
APIクエリに変換され、
ピンが再描画される。

---

# 6. API 仕様（filters/meta）

フィルタは DB 実データから得られる選択肢のみ表示するため、
**初回ロード時にメタデータ API を呼ぶ**。

```
GET /api/filters/meta
```

### 6.1 レスポンス例

```json
{
  "categories": ["cafe","restaurant","bar","bakery", ...],
  "chains": ["BTC","Lightning","ETH","Polygon","Solana","Tron"],
  "countries": ["Japan","USA","Germany","Indonesia","Brazil"],
  "cities": {
    "Japan": ["Tokyo","Osaka","Fukuoka"],
    "USA": ["NYC","LA","SF"]
  }
}
```

---

# 7. Map とフィルタの動作統合

## 7.1 フィルタ変更時に行うこと

1. URL のクエリを書き換え
2. API を再取得
3. ピンを再描画
4. country / city が変わった場合、Map を再センタリング
5. chain / verification は件数変化のみで Map のズームは維持

---

# 8. Stats 連動（v3.0）

Stats ページでも同じフィルタが使えるようにするため、
**フィルタの構造を Map と完全共通にする。**

Stats のリンク例：

```
/stats?country=Japan&chain=BTC
```

---

# 9. エラールール / 境界ケース

* country だけ指定して city が存在しない場合 → city 無視
* category に存在しない値が入っている場合 → 無視
* chain が DB に存在しない値 → 無視
* verification が不正値 → 無視（= default 全選択）

---

# 10. 性能最適化

* フィルタ変更時の API は **debounce 120ms**
* map ピンは **cluster 化必須**
* chain / verification の複数指定は OR マッチ
* DB のインデックス推奨：

  * (category)
  * (country, city)
  * (verification)
  * GIN index on payment.accepts (jsonb)

---

# 11. 将来拡張（v3.1〜v4）

### v3.1

* 「混雑度」「営業時間内のみ」などの dynamic filter
* Map の描画最適化（非同期バッチ）

### v3.2

* Chain の asset/chain 分離フィルタ（高度検索）
* Category の階層構造化

### v4

* 時系列フィルタ（Stats Trends → Map に反映）
* 「過去1年で最も増えたカテゴリ」などのトレンド可視化

---

# 12. 完全モック（PC / Mobile）

## 12.1 PC（テキストモック）

```
[Category ▼] [Chain ▢BTC ▢ETH ▼] [Verification ▢owner ▢community ▢directory ▢unverified] [Country ▼] [City ▼]
```

## 12.2 Mobile（テキストモック）

```
[ Filters ⚙ ]
──────────
Category [▼]
Chain [multi]
Verification [multi]
Country [▼]
City [▼]
──────────
```

