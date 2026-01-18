# UI — CryptoPayMap v2 (Authoritative)

## Appendices (legacy sources)


---

# ui-map-v3.5 — Map / Pin / Drawer Interaction Spec
CryptoPayMap v2 — UI Specification  
Status: FINAL (2025-12)  
Author: BadJoke-Lab

---

# 1. Overview

本仕様は、CryptoPayMap の **Map画面（/map）** における  
PC / Tablet / Mobile の UI 挙動および Drawer 表示ルールを定義する。

対象範囲：

- Map 初期表示
- Pin の表示・hover・click 挙動
- Drawer（左 or bottom）との連動
- レイアウト（全サイズ）
- 閉じる操作

---

# 2. Layout (Global)

```
+--------------------------------------------------------+
|  Header (fixed)                                        |
+--------------------------------------------------------+
|  Map Container (fills viewport)                        |
|                                                        |
|   ┌──────── Drawer (PC/Tablet: left fixed) ─────────┐ |
|   │                                                │ |
|   │  Scrollable detail content                     │ |
|   └────────────────────────────────────────────────┘ |
|                                                        |
+--------------------------------------------------------+
```

## Height Rules

MapContainer は常に viewport を満たす：

```
height: calc(100vh - headerHeight)
```

`h-full` 単独は禁止（Drawer が隠れるため）。

---

# 3. Pin Rendering

## 3.1 Pin Types (verification)

| verification | color    | hex      | photos |
|--------------|----------|----------|---------|
| owner        | Amber    | #F59E0B  | Yes     |
| community    | Blue     | #3B82F6  | Yes     |
| directory    | Teal     | #14B8A6  | No      |
| unverified   | Gray     | #9CA3AF  | No      |

## 3.2 Icon Rendering Method

- 必ず **Leaflet.DivIcon** を使用する  
- HTML 内に inline SVG を配置  
- hover scale アニメーション：  

```
.cpm-pin { transition: transform 0.15s ease; }
.cpm-pin:hover { transform: scale(1.12); }
.cpm-pin.active { transform: scale(1.25); }
```

## 3.3 Active State

ピンがクリックされた場合：

```
selectedPinId = place.id
そのピンだけ .active class が付与される
```

---

# 4. Interaction Flow (全サイズ共通)

```
Pin Click → Drawer Open  
Map Click / Close Button → Drawer Close
```

Drawer open/close transition:

- 左Drawer：slide-in (translate-x: -100% → 0)
- モバイルDrawer：slide-up (translate-y: 100% → 0)

---

# 5. PC Layout (≥1024px)

### Drawer Behavior（左固定）

```
Pin Click → 左ドロワー open（幅固定）
地図クリック → close
```

### Drawer Width

```
min-width: 360px  
max-width: 420px  
```

### Mobile-like Preview 不要  
PC では常に「フル詳細」を即表示。

---

# 6. Tablet Layout (768px–1023px)

Tablet も PC と同じ **左Drawer方式** とする。

理由：
- Map + Drawer の並列 UI が保てる
- Google Maps の Tablet 挙動に近い

ただし幅だけ 320–380px で最適化。

---

# 7. Mobile Layout (≤767px)

Mobile は **Bottom Drawer（二段階）** を採用。

## 7.1 Drawer States

### (1) Preview（約35%高さ）
必須要素：

- 店名
- verification badge
- category + 簡易住所
- accepted（横並び）

写真は preview では **表示しない**。

### (2) Full Detail（約88%高さ）
すべての詳細要素を表示（写真含む）。

### (3) Close
- 下スワイプ
- 地図タップ

---

# 8. Close Rules（全サイズ）

- Drawer 内の **×ボタン**
- Map 空白クリック
- Mobile：下スワイプ

---

# 9. States

```
selectedPlaceId: string | null
drawerOpen: boolean
drawerMode: "preview" | "full" | null
```

---

# 10. Future Flexibility（方針）

- 左Drawer → 将来右Drawerへ切替可能（クラス入替のみ）
- ピン形状の変更も DivIcon なら容易
- Preview の高さ・構成も調整可能

---

# End


---

# ui-drawer-v3.5 — Drawer Detail UI Specification
CryptoPayMap v2 — UI Specification  
Status: FINAL (2025-12)

---

# 1. Overview

本仕様は、Drawer（PC/Tablet 左固定、Mobile bottom-slide）で表示する  
**店舗詳細 UI の構造・表示ルール** を定義する。

---

# 2. Drawer Structure

```
Drawer
 ├─ Header Row
 │    ├─ 店名 (wrap allowed)
 │    └─ verification badge
 │
 ├─ Category + 住所（簡易表記）
 │
 ├─ Accepted（支払対応）
 │
 ├─ Photos（owner & community のみ）
 │
 ├─ Description
 │
 ├─ Website / SNS
 │
 ├─ Payment Note
 │
 ├─ Amenities
 │
 └─ Submitter Info
```

---

# 3. Field Rules (DB準拠)

DB/API に存在する項目のみを表示する。

| Field | 表示対象 | 備考 |
|-------|-----------|------|
| name | 全verification | 折り返し許容 |
| verification | 全verification | バッジ表示 |
| category | 全verification | アイコン + text |
| address | 全verification | “Shibuya, Tokyo”簡易形式 |
| accepted[] | 全verification | Pill 表示 |
| photos | owner, community のみ | directory/unverifiedは禁止 |
| website | optional | Row表示 |
| socials | optional | icon付き水平リスト |
| description | optional | 折り返し |
| payment_note | optional | 注意文 |
| amenities | optional | アイコン行 |
| submitter | required | フッタ部分に固定 |

---

# 4. Verification別ルール

## owner
- 写真カルーセル **あり**
- すべての情報を表示

## community
- 写真カルーセル **あり**
- owner と同じ構造

## directory
- **写真なし**
- description 省略可  
- 最小限 UI（店名・カテゴリ・address・accepted）

## unverified
- **写真なし**
- **description 表示禁止（仕様）**
- minimal UI 表示

---

# 5. Mobile Drawer Behavior

## Preview（35%）

表示要素：

- 店名
- verification badge
- category + 住所簡易
- accepted（折返しあり）

写真なし  
説明なし  
web/socialなし

## Full Detail（88%）

- 全セクション表示（verificationルールに従う）
- スクロール可能
- ヘッダーと店名行は固定

---

# 6. Animations

### PC/Tablet
```
Drawer open: translateX(-100%) → 0 (0.25s)
Drawer close: 0 → -100%
```

### Mobile
```
Preview: translateY(100%) → translateY(65%)
Full: translateY(65%) → 0
Close: translateY → 100%
```

---

# 7. Close Operation

PC/Tablet：
- ×ボタン
- Map click

Mobile：
- 下スワイプ
- Map tap

---

# 8. Styling Principles

- 白ベース / 灰ボーダー
- store name は 20–22px  
- badge は右寄せ  
- セクションは 16–20px padding  
- 写真カルーセルは横スクロール  
- accepted pill は 10–12px 高さ  
- Drawer 内は `overflow-y: auto`

---

# End


---

# Map layout: 0px height prevention rules

## Why this matters
Map rendering can silently break when its container computes to `0px` height. When that happens, Leaflet still initializes but the map appears blank or collapsed. This has caused production regressions in the past, so the layout rules below are treated as **non-negotiable** to prevent a repeat.

## Non-negotiable rules

### 1) Always guarantee a minimum height
Ensure the map container (and any wrapper that controls its size) has an explicit height or **minimum height**. Without this, the computed height can fall back to `0px` when parent constraints change.

### 2) Parent layout must allow vertical growth
If a parent uses Flexbox, it must allow the map section to grow to fill available space. Use `flex: 1` (or `flex-grow: 1`) on the map wrapper and ensure the parent itself has a defined height. A flex child with no growth in a heightless parent will collapse to `0px`.

### 3) Keep Leaflet container height explicit
The `.leaflet-container` element must inherit a stable height. Ensure the CSS chain from the page down to the Leaflet container defines a height or min-height so the map surface remains measurable.

## Quick checklist
- [ ] The map wrapper has `min-height` (or fixed height in specific layouts).
- [ ] Any flex parent sets a height and the map wrapper uses `flex: 1`.
- [ ] `.leaflet-container` ends up with a non-zero computed height.



---

# Map Layering Rules (Click-Through Prevention)

This document defines the layering and interaction rules for the map UI to prevent the regression where pins are visible but not clickable.

## Key Layer Roles

| Layer | Typical element(s) | Responsibility | Notes |
| --- | --- | --- | --- |
| Leaflet panes | tile, overlay, marker panes | Core map rendering | Marker pane must stay above tile/overlay panes so pins remain visible and clickable. |
| Leaflet controls | zoom, attribution, custom controls | Map-level UI | Controls should remain on top of map panes but below app-level overlays. |
| Drawer | side drawer / nav | Global navigation | Should sit above controls and map panes to avoid map interaction conflicts. |
| Sheet / bottom panel | details sheet, filter panel | Contextual UI | Should overlay map when open; only its interactive regions should capture clicks. |
| Overlays | modals, toasts, banners | App-level alerts and flows | Must appear above all map and layout layers. |

## Pointer-Events Principles

1. **Map interaction is the default.** Non-interactive overlay wrappers should use `pointer-events: none` so panning/zooming and pin clicks reach the map.
2. **Only interactive regions opt in.** Buttons, list items, and form fields should explicitly set `pointer-events: auto` (or inherit) so they receive input.
3. **Avoid full-screen blockers.** A full-screen overlay with `pointer-events: auto` should only be used when intentionally blocking map interaction (e.g., modal).
4. **Sheet/Drawer boundaries matter.** Ensure only the visible sheet/drawer area captures clicks; the rest of the viewport should be transparent to events.

## z-index Principles

1. **Pins must stay above the map.** Leaflet marker pane should remain above tile and overlay panes to prevent invisible-but-unclickable pins.
2. **Controls above map panes, below app overlays.** Leaflet controls should not obscure app-level UI (drawer/sheet/overlay).
3. **App overlays are the top layer.** Modals, toasts, and banners should be the highest z-index when active.
4. **Avoid arbitrary z-index inflation.** Use a shared scale (documented in CSS/tokens if available) and only bump z-index when the layer’s role requires it.

## Quick Checklist

- [ ] Pins are clickable in all map states (drawer open, sheet open, overlays shown).
- [ ] Non-interactive wrappers use `pointer-events: none`.
- [ ] Interactive UI elements explicitly allow pointer events.
- [ ] z-index matches the layer’s role (map panes < controls < drawer/sheet < overlays).
