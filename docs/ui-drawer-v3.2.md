# 📄 **ui-drawer-v3.2.md — Drawer（詳細ドロワー）完全仕様書 v3.2**

**Status:** Final / Implementation-Ready
**Scope:**
Leaflet Map → Popup → Drawer（詳細パネル）
PC＝右側固定パネル
Mobile＝Bottom Sheet 全画面

---

# 1. Drawer の役割

Drawer は「1店舗の全情報を詳細表示する唯一のビュー」。

Popup が簡易で、Drawer が**正式な詳細ページ**。

Drawer は以下を満たす：

* 項目の **フル表示（owner/community）**
* **削減版（directory/unverified）**
* PC＝右パネル
* Mobile＝Bottom Sheet（全画面）
* Navigation（Google / Apple / OSM）**常時表示**
* 「閉じる」「スクロール保持」「Map はそのまま操作可能」

---

# 2. Drawer 表示条件

### PC

```
marker.click → Drawer.open(place.id)
popup.ViewDetails → Drawer.open
```

### Mobile

```
marker.tap → Popup
Popup.ViewDetails → Drawer.open
```

Drawer は Popup の上位互換であり Popup を自動で閉じる。

---

# 3. Drawer 配置・アニメーション

## PC（右側固定パネル）

```
position: fixed
right: 0
top: 0
height: 100vh
width: min(480px, 45vw)
background: #FFFFFF
border-left: 1px solid #E5E7EB
overflow-y: scroll
z-index: 8000
```

### アニメーション

```
open:   translateX(100%) → 0      (250ms ease-out)
close:  0 → translateX(100%)      (250ms ease-in)
```

---

## Mobile（Bottom Sheet → 全画面）

```
position: fixed
left: 0
right: 0
top: 0
bottom: 0
background: #FFFFFF
z-index: 9000
overflow-y: scroll
```

### アニメーション

```
open:   translateY(100%) → 0      (300ms)
close:  0 → translateY(100%)      (300ms)
```

---

# 4. セクション構成（順番固定）

```
(1) Header：店名＋バッジ＋Last verified
(2) Meta：カテゴリ＋都市/国
(3) Photos（owner/community）
(4) About（全段階）
(5) Hours（owner/community）
(6) Payments（owner/community）
(7) Contact（owner/community）
(8) Amenities（owner/community）
(9) Location（全段階）
(10) Navigation（Google / Apple / OSM）
(11) Contribute / Report
```

---

# 5. 認証4段階別の表示ルール（決定版）

| section           | owner  | community | directory | unverified |
| ----------------- | ------ | --------- | --------- | ---------- |
| Photos            | ✔      | ✔         | ✘         | ✘          |
| About             | ✔ full | ✔ full    | ✔ short   | ✔ short    |
| Hours             | ✔      | ✔         | ✘         | ✘          |
| Payments          | ✔      | ✔         | ✘         | ✘          |
| Contact           | ✔      | ✔         | ✘         | ✘          |
| Amenities         | ✔      | ✔         | ✘         | ✘          |
| Navigation        | ✔      | ✔         | ✔         | ✔          |
| Contribute/Report | ✔      | ✔         | ✔         | ✔          |

---

# 6. カラーガイド（バッジ色 4段階）

| status     | 色名    | Hex       | 使用箇所       |
| ---------- | ----- | --------- | ---------- |
| owner      | Amber | `#F59E0B` | バッジ背景・テキスト |
| community  | Blue  | `#3B82F6` | バッジ背景・テキスト |
| directory  | Teal  | `#14B8A6` | バッジ背景・テキスト |
| unverified | Gray  | `#9CA3AF` | バッジ背景・テキスト |

---

# 7. 各セクション詳細仕様

---

## (1) Header

```
[認証バッジ]     Last verified: YYYY-MM-DD
店名 (H1)
```

### スタイル

```
badge: rounded-full, px-2, py-[2px]
font-size: 11px
```

---

## (2) Meta

```
cafe · Tokyo, Japan
```

```
font-size: 14px
color: #6B7280
```

---

## (3) Photos（owner / community）

### PC

```
height: 260px
object-fit: cover
carousel arrows: 40px buttons
```

### Mobile

```
height: 220px
swipe support
```

---

## (4) About

### owner / community：全文

### directory / unverified：3行制限（line-clamp）

---

## (5) Hours（owner / community）

```
Hours
Mo–Su 07:00–20:00
```

---

## (6) Payments（owner / community）

構造：

```
Payments
Assets
• BTC (Lightning)
• ETH (on-chain)

Payment pages
• https://xxxxx
```

---

## (7) Contact（owner / community）

```
Contact
Website: Open ↗
Phone: +0 0000 000000
X: @account
Instagram: @foo
```

URL は target="_blank"

---

## (8) Amenities（owner / community）

```
Amenities
• Wi-Fi
• Outdoor seating
• Pets allowed
```

---

## (9) Location（全段階）

```
Location
McMurdo Station, Antarctica
Full address...
```

---

## (10) Navigation（全段階・固定要素）

```
Navigation
Google Maps | Apple Maps | OpenStreetMap
```

### URL生成

```
https://www.google.com/maps/search/?api=1&query=<lat>,<lng>
https://maps.apple.com/?q=<lat>,<lng>
https://www.openstreetmap.org/?mlat=<lat>&mlon=<lng>#map=18/<lat>/<lng>
```

---

## (11) Contribute / Report（全段階）

```
[ Contribute / Report ]
```

* 高さ：48px
* border-radius: 8px
* hover: bg-gray-50

---

# 8. Drawer UI モック（完全版）

---

## Owner（PC）

```
┌──────────────────────────────┐
│ [Amber Badge] Last verified… │
│ Antarctica Owner Café        │
│ cafe · McMurdo, Antarctica   │
│                              │
│ [Photo Carousel 260px]       │
│                              │
│ About                        │
│ OWNER (Gold) — …             │
│                              │
│ Hours                        │
│ Mo–Su 07:00–20:00            │
│                              │
│ Payments                     │
│ • BTC (Lightning)            │
│ • ETH (on-chain)             │
│                              │
│ Contact                      │
│ Website: Open ↗              │
│ Phone: +00 …                 │
│ X: @antarctica_owner         │
│                              │
│ Amenities                    │
│ • Wi-Fi                      │
│ • Outdoor seating            │
│                              │
│ Location                     │
│ McMurdo Station, Antarctica  │
│                              │
│ Navigation                   │
│ Google | Apple | OSM         │
│                              │
│ [ Contribute / Report ]      │
└──────────────────────────────┘
```

---

## Community（Mobile）

```
──────── Drawer ────────
[✕]

[Photo 220px]

[Blue Badge] Last verified: …
Crypto Café
cafe · Jakarta, Indonesia

About
COMMUNITY (Blue) — …

Hours
Mo–Su 09:00–18:00

Payments
• BTC
• ETH

Contact
X: @cryptocafe

Amenities
• Wi-Fi

Location
Jakarta, Indonesia

Navigation
Google Maps | Apple Maps | OSM

[ Contribute / Report ]
────────────────────────
```

---

## Directory（PC）

```
[Teal Badge] Directory sourced
Block Electronics
electronics · Berlin, Germany

About
Directory entry obtained from…

Location
Berlin, Germany

Navigation
Google | Apple | OSM

[ Contribute / Report ]
```

---

## Unverified（Mobile）

```
──────── Drawer ────────
[✕]
[Gray Badge]
Local Bar
bar · NYC, USA

About
Unverified entry added by user…

Location
NYC, USA

Navigation
Google | Apple | OSM

[ Contribute / Report ]
────────────────────────
```

---

# 9. Drawer イベント仕様（完全）

```
drawer.open(id):
  - close popup
  - fetch /api/places/{id}
  - render sections by verification rules
  - scrollTop = 0

drawer.close():
  - animate close
  - after 250ms → unmount

ESC press → close
Map click → close
Background click（mobile） → close
```

---

# 10. 完成条件（Codex / Gemini 基準）

| 要件                 | 条件                 |
| ------------------ | ------------------ |
| 右パネル / BottomSheet | PC/Mobile 両対応      |
| 認証4段階の差分           | 全セクション分岐が正確        |
| Photo の有無          | owner/communityのみ  |
| Navigation         | 全段階表示              |
| Drawer連動           | popup→drawer が必ず機能 |
| スクロール管理            | open時に scrollTop=0 |
| Mapとの連携            | Drawer開いてても Map動く  |

---
