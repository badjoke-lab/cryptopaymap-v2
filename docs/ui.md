# UI — CryptoPayMap v2（正本仕様 / Authoritative）

- **Status:** FINAL（2025-12）
- **Author:** BadJoke-Lab
- **目的:** CryptoPayMap v2 の UI を「実装と照合できる粒度」で固定する。
- **対象:**  
  1) `/map`（地図 + ピン + Drawer）  
  2) `/submit`（申請フロー：owner/community/report）  
  3) `/internal`（運営審査：一覧/詳細/approve/reject/promote）  
- **非交渉（Non-negotiable）:**  
  - Submit は **入力 → 確認（confirm）→ 最終送信** の2段を固定し、**最終送信（POST）は confirm 画面でのみ行う**。  
  - 画像添付（gallery/proof/evidence）の扱いは **public / internal を必ず分離**する（gallery 公開可、proof/evidence 非公開）。  
  - 仕様追加は歓迎だが、**勝手な簡略化・削除（ボリューム低下）を禁ずる**。

---

## 0. 全体共通ルール（UI Global Rules）

### 0.1 ブレークポイント（固定）
- **Mobile:** ≤ 767px
- **Tablet:** 768px – 1023px
- **PC:** ≥ 1024px

### 0.2 画面レイヤー（z-index の役割分離）
- Map（Leaflet panes）
- Map Controls（ズーム等）
- Drawer / Sheet（詳細・フィルタ）
- Overlays（モーダル・トースト・バナー）
- 原則として **「地図操作がデフォルト」**。必要な部分だけクリックを奪う（後述の pointer-events 原則に従う）。

### 0.3 主要 UI 状態（必須）
- **Loading:** 最低限のローディング（スピナー/スケルトン）
- **Empty:** 「該当なし」＋フィルタ解除導線
- **Error:** 1行の要約 + 詳細（折りたたみ可）
- **Degraded（受理はしたが保留）:** Submit の 202 状態を表示できること

### 0.4 文言ポリシー（必須）
- 「ユーザーが今できること」を先に出す（例：再送 / 戻る / 修正）
- エラー詳細（技術的内容）は折りたたみ可だが、**隠し切らない**

---

## 付録（過去ソース / Legacy appendices）
> 以降の「map/drawer/0px/レイヤー」章は、過去の仕様断片を**削らず保持**しつつ、読みやすい日本語に整形したもの。  
> 今回の修正（追記）は主に **Submit / Internal** の章を追加して正本を完成させる。

---

# ui-map-v3.5 — Map / Pin / Drawer 連動仕様（/map）

CryptoPayMap v2 — UI 仕様  
Status: FINAL（2025-12）  
Author: BadJoke-Lab

---

## 1. 概要（Overview）

本仕様は、CryptoPayMap の **Map 画面（/map）** における  
PC / Tablet / Mobile の UI 挙動および Drawer 表示ルールを定義する。

対象範囲：
- Map 初期表示
- Pin の表示・hover・click 挙動
- Drawer（左 or bottom）との連動
- レイアウト（全サイズ）
- 閉じる操作

---

## 2. レイアウト（全サイズ共通 / Global）

```

+--------------------------------------------------------+
|  Header（固定）                                         |
+--------------------------------------------------------+
|  Map Container（viewport を満たす）                      |
|                                                        |
|   ┌──────── Drawer（PC/Tablet: 左固定） ────────────┐ |
|   │                                                │ |
|   │  詳細コンテンツ（スクロール）                     │ |
|   └────────────────────────────────────────────────┘ |
|                                                        |
+--------------------------------------------------------+

```

### 高さルール（Height Rules）
MapContainer は常に viewport を満たす：

```

height: calc(100vh - headerHeight)

```

`h-full` 単独は禁止（Drawer が隠れる／Mapが0px化する事故を誘発するため）。

---

## 3. ピン描画（Pin Rendering）

### 3.1 ピン種別（verification）
| verification | 色名 | hex | 写真 |
|--------------|------|-----|------|
| owner        | Amber | #F59E0B | Yes |
| community    | Blue  | #3B82F6 | Yes |
| directory    | Teal  | #14B8A6 | No  |
| unverified   | Gray  | #9CA3AF | No  |

### 3.2 アイコン描画方式（固定）
- 必ず **Leaflet.DivIcon** を使用  
- HTML 内に inline SVG を配置  
- hover スケールアニメーション：

```

.cpm-pin { transition: transform 0.15s ease; }
.cpm-pin:hover { transform: scale(1.12); }
.cpm-pin.active { transform: scale(1.25); }

```

### 3.3 Active 状態
ピンがクリックされた場合：

```

selectedPinId = place.id
そのピンだけ .active class が付与される

```

---

## 4. 連動フロー（全サイズ共通 / Interaction Flow）

```

Pin Click → Drawer Open
Map Click / Close Button → Drawer Close

```

Drawer open/close transition：
- 左Drawer：slide-in（translate-x: -100% → 0）
- モバイルDrawer：slide-up（translate-y: 100% → 0）

---

## 5. PC レイアウト（≥1024px）

### Drawer 挙動（左固定）
```

Pin Click → 左ドロワー open（幅固定）
地図クリック → close

```

### Drawer 幅
```

min-width: 360px
max-width: 420px

```

### PC では preview 不要
PC では常に「フル詳細」を即表示する。

---

## 6. Tablet レイアウト（768px–1023px）
Tablet も PC と同じ **左Drawer方式**。

理由：
- Map + Drawer の並列 UI が保てる
- Google Maps の Tablet 挙動に近い

ただし幅だけ 320–380px で最適化する。

---

## 7. Mobile レイアウト（≤767px）
Mobile は **Bottom Drawer（二段階）** を採用する。

### 7.1 Drawer 状態（States）

#### (1) Preview（約35%高さ）
必須要素：
- 店名
- verification badge
- category + 簡易住所
- accepted（横並び）

写真は preview では **表示しない**。

#### (2) Full Detail（約88%高さ）
すべての詳細要素を表示（写真含む）。

#### (3) Close
- 下スワイプ
- 地図タップ

---

## 8. 閉じるルール（全サイズ共通 / Close Rules）
- Drawer 内の **×ボタン**
- Map 空白クリック
- Mobile：下スワイプ

---

## 9. 状態管理（States）
```

selectedPlaceId: string | null
drawerOpen: boolean
drawerMode: "preview" | "full" | null

```

---

## 10. 将来拡張（方針 / Future Flexibility）
- 左Drawer → 将来右Drawerへ切替可能（クラス入替のみ）
- ピン形状の変更も DivIcon なら容易
- Preview の高さ・構成も調整可能

---

# ui-drawer-v3.5 — Drawer 詳細 UI 仕様（/map Drawer）

CryptoPayMap v2 — UI 仕様  
Status: FINAL（2025-12）

---

## 1. 概要（Overview）
本仕様は、Drawer（PC/Tablet 左固定、Mobile bottom-slide）で表示する  
**店舗詳細 UI の構造・表示ルール** を定義する。

---

## 2. Drawer 構造（Drawer Structure）
```

Drawer
├─ Header Row
│    ├─ 店名（折り返し可）
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

## 3. フィールド表示ルール（DB準拠）
DB/API に存在する項目のみを表示する。

| フィールド | 表示対象 | 備考 |
|-----------|---------|------|
| name | 全 verification | 折り返し許容 |
| verification | 全 verification | バッジ表示 |
| category | 全 verification | アイコン + テキスト |
| address | 全 verification | “Shibuya, Tokyo” の簡易形式 |
| accepted[] | 全 verification | Pill 表示 |
| photos | owner, community のみ | directory/unverified は禁止 |
| website | optional | 行表示 |
| socials | optional | アイコン付き水平リスト |
| description | optional | 折り返し |
| payment_note | optional | 注意文 |
| amenities | optional | アイコン行 |
| submitter | required | フッタに固定 |

---

## 4. verification 別ルール

### owner
- 写真カルーセル **あり**
- すべての情報を表示

### community
- 写真カルーセル **あり**
- owner と同じ構造

### directory
- **写真なし**
- description 省略可
- 最小限 UI（店名・カテゴリ・address・accepted）

### unverified
- **写真なし**
- **description 表示禁止（仕様）**
- minimal UI 表示

---

## 5. Mobile Drawer 挙動

### Preview（35%）
表示要素：
- 店名
- verification badge
- category + 住所簡易
- accepted（折返しあり）

写真なし / 説明なし / web・social なし

### Full Detail（88%）
- 全セクション表示（verification ルールに従う）
- スクロール可能
- ヘッダーと店名行は固定

---

## 6. アニメーション（Animations）

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

## 7. 閉じる操作（Close Operation）

PC/Tablet：
- ×ボタン
- Map click

Mobile：
- 下スワイプ
- Map tap

---

## 8. スタイリング原則（Styling Principles）
- 白ベース / 灰ボーダー
- 店名は 20–22px
- バッジは右寄せ
- セクションは 16–20px padding
- 写真カルーセルは横スクロール
- accepted pill は 10–12px 高さ
- Drawer 内は `overflow-y: auto`

---

# 申請（Submit）UI 仕様（/submit）※今回追記・正本化

> ここが現行 ui.md に抜けていた “漏れ” の核心。削除は禁止。  
> API 仕様（confirm-only POST / 添付種別）と UI の対応を固定する。

---

## 1. 目的
- ユーザーが **店舗の追加/修正/通報**を申請できる導線を提供する。
- 申請は `kind` で分岐する：
  - `owner`（Owner Verified 申請）
  - `community`（Community Verified 申請）
  - `report`（Takedown/修正通報）

---

## 2. 画面遷移（Routes）※固定
- `/submit`：kind 選択のみ（説明 + ボタン3つ）
- `/submit/owner`：入力
- `/submit/community`：入力
- `/submit/report`：入力
- `/submit/{kind}/confirm`：確認（最終送信はここでのみ実行）
- `/submit/done`：完了（200/201 と 202 degraded を分岐表示）

---

## 3. “最終送信は confirm のみ” ルール（最重要）
- 入力画面（/submit/{kind}）のボタンは **「確認へ」**。  
  - ここでは POST しない（ローカル保持のみ）。
- confirm 画面（/submit/{kind}/confirm）のボタンが **「送信する」**。  
  - ここでのみ `POST /api/submissions` を実行する。

---

## 4. Draft 保持（必須）
- 入力 ⇄ confirm の往復で入力が消えないこと。
- storage は実装都合で良い（sessionStorage 推奨、必要なら localStorage）。
- 送信成功（200/201/202）で Draft を削除。

---

## 5. 入力項目（あなたの固定要求を正本化）

### 5.1 Owner Verified（/submit/owner）
- **希望ステータス（固定表示）:** `Owner Verified`
- **本人確認（必須・選択式）:** 以下から1つ
  - ドメイン認証
  - 社用メール OTP
  - ダッシュボード SS（スクショ）
- **決済URL または 決済画面SS（必須）**
- **添付（画像）:**
  - `proof`（0..1）※本人確認/決済の根拠として扱う
  - `gallery`（0..8）※公開候補の写真

### 5.2 Community Verified（/submit/community）
- **希望ステータス（固定表示）:** `Community Verified`
- **独立した証拠URL 2本以上（必須）**
  - 入力欄を最初から2つ
  - 「追加」ボタンで増やせる（上限は実装で制御）
  - **独立条件:** 同一ドメインの焼き直し・相互依存（同一ソースの転載）を避ける旨の説明を表示
- **添付（画像）:**
  - `gallery`（0..4）※公開候補の写真

### 5.3 Report（Takedown/修正）（/submit/report）
- **何が誤りか（必須）**
- **証拠URL（必須）**
- **「非表示希望 / 修正希望」（必須）**
- **添付（画像）:**
  - `evidence`（0..4）※非公開（運営のみ閲覧）

---

## 6. クライアント側バリデーション（必須）
- 画像形式：jpeg/png/webp
- 画像サイズ：≤ 2MB
- 枚数上限：kind別（owner/community/report）
- エラーは「どの項目が」「なぜ」かを日本語で出す（1行要約 + 詳細）

---

## 7. 送信結果（/submit/done の分岐）
- **200/201:** 「送信完了（審査待ち）」＋ submissionId
- **202（degraded）:** 「受理はしたが保留（復旧後に処理される）」＋ submissionId  
  - ※ユーザーに再送を強要しない（重複の原因になるため）

---

## 8. 画像の公開/非公開の表示ルール（必須）
- gallery：将来公開されうる写真（public配信の対象）
- proof / evidence：**非公開（internalのみ）**
- UI では、ユーザー側には「公開される可能性があるのは gallery のみ」を明示する。

---

# 運営審査（Internal）UI 仕様（/internal）※今回追記・正本化

> 現行 ui.md に不足していた “運用の核”。  
> 申請画像（proof/evidence）を運営だけが見られる導線を明確に固定する。

---

## 1. 画面構成（推奨ルート）
- `/internal`：ゲート（未認証なら 401/403 相当の UI）
- `/internal/submissions`：申請一覧
- `/internal/submissions/[id]`：申請詳細

---

## 2. 一覧（/internal/submissions）
### 2.1 必須 UI
- ステータスタブ：
  - pending / approved / rejected
- kind フィルタ：
  - owner / community / report
- 検索（任意だが推奨）：
  - 店名・国・都市・submissionId の部分一致

### 2.2 一覧カード/行の必須情報
- submissionId
- kind
- status
- created_at
- payload 要約（name / country / city など）

---

## 3. 詳細（/internal/submissions/[id]）
### 3.1 必須情報
- payload（正規化済み）
  - 人間が読める表示に整形（箇条書き/テーブル）
- submitted_by（必要最小限）
- created_at / updated_at
- review_note（存在する場合）

### 3.2 添付（画像）の必須セクション分離
- **gallery（公開候補）**
  - public gallery の URL で閲覧できても良い
- **proof（非公開）**
  - internal media 経由のみで閲覧
- **evidence（非公開）**
  - internal media 経由のみで閲覧
- 非公開画像（proof/evidence）は **Cache-Control: no-store 相当**で扱う（ブラウザ保存を誘発しない設計）。

### 3.3 Actions（必須）
- approve（全 kind）
- reject（全 kind）
- promote（owner/community のみ、かつ approved のみ）
- report に promote は表示しない（仕様固定）

---

## 4. 状態とエラー表示（必須）
- 401（未認証）：ログイン/認証が必要
- 403（権限なし）：権限がない
- 404（存在しない）：submission が見つからない
- 409（promote できない）：not approved / kind 不一致
- 500：内部エラー（再試行導線を出す）

---

# Map レイアウト：0px 高さ事故防止ルール（退行防止）

## なぜ重要か
Map のコンテナが計算結果で `0px` 高さになると、Leaflet は初期化されても地図が空白/潰れて見える。
過去に本番退行を起こしたため、以下は **非交渉（non-negotiable）** とする。

## 非交渉ルール

### 1) 常に最小高さを保証する
Map コンテナ（およびサイズを支配するラッパー）は、明示的な height か **min-height** を持つ。
親制約の変化で 0px に落ちる設計は禁止。

### 2) 親レイアウトは縦方向の成長を許可する
親が Flexbox の場合、Map セクションが余白を埋めて成長できること。
Map ラッパーに `flex: 1`（または `flex-grow: 1`）を付与し、親自体にも高さがあること。
高さのない親の中で growth がない子は 0px に潰れる。

### 3) Leaflet コンテナの高さ連鎖を明示する
`.leaflet-container` が安定した高さを継承できるよう、
ページ→ラッパー→Map→Leaflet の CSS 連鎖で height/min-height を途切れさせない。

## クイックチェック
- [ ] Map ラッパーに `min-height`（または特定レイアウトで固定高さ）
- [ ] Flex 親が height を持ち、Map ラッパーが `flex: 1`
- [ ] `.leaflet-container` の計算後高さが 0 ではない

---

# Map レイヤー規約（クリック不能退行の防止：Click-Through Prevention）

この章は「ピンが見えるのにクリックできない」退行を防ぐための
レイヤリング/入力制御ルールを定義する。

## 主要レイヤーの役割

| レイヤー | 典型要素 | 責務 | 注意 |
|---|---|---|---|
| Leaflet panes | tile/overlay/marker panes | 地図の描画 | marker pane が tile/overlay より上で、ピンが可視・クリック可能であること |
| Leaflet controls | zoom/attribution/custom | 地図UI | map panes より上、アプリUIより下が基本 |
| Drawer | side drawer / nav | 詳細UI | controls と map panes の上に乗る |
| Sheet / bottom panel | details sheet / filter | 文脈UI | 開いている領域だけがクリックを奪う（全面ブロック禁止） |
| Overlays | modal/toast/banner | アプリ最上位 | 必要時のみ地図操作をブロックする |

## pointer-events 原則

1. **地図操作がデフォルト。** クリック不要の overlay ラッパーは `pointer-events: none` にして、パン/ズーム/ピンクリックが届くようにする。  
2. **必要な部分だけ opt-in。** ボタン/リスト/フォームなど、操作が必要な要素だけ `pointer-events: auto`（または継承）で入力を受ける。  
3. **全画面ブロッカーを避ける。** `pointer-events: auto` の全面 overlay は、モーダル等「意図的にブロックする時のみ」。  
4. **Sheet/Drawer の境界が重要。** 表示領域だけがクリックを奪い、それ以外は透過であること。

## z-index 原則

1. **ピンは地図より上でクリック可能。** marker pane が tile/overlay より上。  
2. **controls は map panes より上、アプリ overlay より下。**  
3. **アプリ overlay が最上位。** modal/toast/banner は最上位 z-index。  
4. **無秩序な z-index インフレ禁止。** 役割に基づいたスケールを用い、必要時のみ上げる。

## クイックチェック
- [ ] Drawer open / sheet open / overlay 表示中でもピンがクリックできる
- [ ] クリック不要のラッパーは `pointer-events: none`
- [ ] 操作要素だけ `pointer-events` を許可
- [ ] z-index が役割に従っている（map panes < controls < drawer/sheet < overlays）

