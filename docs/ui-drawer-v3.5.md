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
