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
