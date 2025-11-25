# 📄 **ui-popup-v3.2.md — Popup UI 最終仕様（v3.2）**

Version: **3.2 / Final**
Target: CryptoPayMap v2
Scope: **Map → Popup（軽量版Modal）**

---

# 1. Popup の目的

地図上で **ピンをタップした瞬間に表示する “最小情報カード”**。

Drawer（詳細）に行く前の **サマリー** を提示する役割。

* 超高速に内容を把握できること
* 画像 1〜2 枚を “確認する用途” に限定
* Verification（owner/community/directory/unverified）を **一目で判断**
* UI は固定のライトグレー（ダークモード非対応）
* 過度な情報は Drawer に回す

---

# 2. レイアウト（構成要素）

### Popup の構成（固定）

```
──────────────────────
[Image Thumbnail (max 2)]
──────────────────────
[Name]
[Verification Badge]
[Category / Country-Flag / City]
──────────────────────
[Accepted Payment Icons (max 4)]
──────────────────────
[Open Drawer Button → “View details”]
──────────────────────
```

---

# 3. 表示ルール

## 3.1 画像（media）

| verification   | 画像表示 | 内容                 |
| -------------- | ---- | ------------------ |
| **owner**      | 最大2枚 | media[0], media[1] |
| **community**  | 最大1枚 | media[0]           |
| **directory**  | 0    | 非表示                |
| **unverified** | 0    | 非表示                |

* directory / unverified は **画像0件が必須**（ETL / CI 側でも enforce）
* Popup が画像領域空の場合は自動で非表示（レイアウト詰め）

---

## 3.2 Name（必須）

* places.name
* 最大 1 行（ellipsis）
* サイズ：16px セミボールド

---

## 3.3 Verification Badge

統一バッジ（Drawer / MapDetail と同一デザイン）

| status     | color               | label              |
| ---------- | ------------------- | ------------------ |
| owner      | `#F59E0B` Amber 500 | Owner Verified     |
| community  | `#3B82F6` Blue 500  | Community Verified |
| directory  | `#14B8A6` Teal 500  | Directory          |
| unverified | `#9CA3AF` Gray 400  | Unverified         |

Badge は **テキスト＋丸い小アイコン** の統一スタイル。

---

## 3.4 Category / Location

```
[Category]・[City], [Country Flag]
```

例：

```
Cafe ・ Shibuya 🇯🇵
```

* category は lower → Title 化
* 国旗は ISO country → emoji flag
* 最大 1 行、ellipsis

---

## 3.5 Accepted Payments（最大4件）

MapDetail と Drawer の “受入アイコンセット” の **サマリー版**

表示する順序：

1. BTC
2. Lightning
3. ETH
4. USDT
5. その他アルファベット順

上限は **4 個**（それ以上は `+3` のように省略）

例：

```
BTC / Lightning / ETH / +2
```

アイコンは 20px、カラー固定（ブランド色）

---

## 3.6 CTA

### **“View details →”**

* 押すと `Drawer` を開く
* Drawer に props: `placeId` を渡してフル読み込み
* Bootstrap ではなく純粋な Tailwind コンポーネント

---

# 4. サイズ・スタイル

### Popup は地図上の “軽量カード” 固定

* 幅：**260px**
* 背景色：**#F7F7F7（ライトグレー固定）**
* 枠：radius 10px
* 影：`rgba(0,0,0,0.12) 0 2px 6px`
* ダークモードは非対応（必ずライト版）

---

# 5. 動作仕様

### 5.1 表示トリガー

* ユーザーが Map のピンをクリックしたとき
* 前の Popup が存在すれば閉じてから新しいものを開く
* 表示位置はピンの上部（オフセット 12px）

---

### 5.2 非表示トリガー

* Map をドラッグ
* ESC
* Drawer を開いたとき
* 他のピンを押したとき

---

# 6. フォールバック

### データ不完全時

| 欠落         | UI挙動               |
| ---------- | ------------------ |
| category   | “Category unknown” |
| city       | cityを非表示           |
| country    | flag 非表示           |
| payments 空 | “No payment info”  |
| media 空    | image block 非表示    |

---

# 7. API 依存情報

Popup が利用する API は `/api/places/[id]` のうち以下のフィールド：

```
name
category
city
country
verification.status
media[] (max2)
payments.accepts[]  ※正規化された chain/asset
```

---

# 8. v3.2 での Drawer/Map との整合性

* verification バッジ → 完全統一
* category 表記 → Title 化のルール統一
* location → city, country の順
* payments → 4件上限＋残数表示
* 画像 → owner2 / community1 / others0 の統一ルール

Drawer/Map と仕様が噛み合わない箇所はゼロ。

---

# 9. 禁止事項（過去に問題化したもの）

* ダークモード切替
* アニメーション過多
* hours / about / amenities の表示（Popup では禁止）
* verification 違反の画像表示（directory/unverified 画像禁止）
* “View details” 以外の CTA
* 説明文の挿入
* マップリサイズイベントでの再計算（不要）

---

# 10. 完全版注記

このファイルは **v3.2 の最終仕様確定版**。
Codex / Gemini の両方で同一構造を参照可能。
Map / Drawer / Popup 系 UI の “最終 1/3 セット” のうち Popup 部分。

---
