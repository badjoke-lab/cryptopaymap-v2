# CHK: Footer共通化のための現状確認（/map除外、他ページミニマルフッター統一）

## 1. 対象ページとファイル対応表

### 1-1. 公開ルート（`/map` 除外検討対象）

| URLパス | ファイル | 備考 |
|---|---|---|
| `/` | `app/page.tsx` | 現在 `MapClient` を返す（実質 map UI） |
| `/map` | `app/map/page.tsx` | `MapClient` を返す |
| `/about` | `app/about/page.tsx` | 情報ページ |
| `/submit` | `app/submit/page.tsx` | 送信導線トップ |
| `/submit/owner` | `app/submit/owner/page.tsx` | フォーム |
| `/submit/owner/confirm` | `app/submit/owner/confirm/page.tsx` | 確認画面 |
| `/submit/community` | `app/submit/community/page.tsx` | フォーム |
| `/submit/community/confirm` | `app/submit/community/confirm/page.tsx` | 確認画面 |
| `/submit/report` | `app/submit/report/page.tsx` | フォーム |
| `/submit/report/confirm` | `app/submit/report/confirm/page.tsx` | 確認画面 |
| `/submit/done` | `app/submit/done/page.tsx` | 完了画面 |
| `/stats` | `app/stats/page.tsx`（実体は `app/stats/StatsPageClient.tsx`） | 統計ページ |
| `/discover` | `app/discover/page.tsx` | 情報ページ |
| `/donate` | `app/donate/page.tsx` | 情報ページ |
| `/status` | `app/status/page.tsx`（実体は `app/status/StatusClient.tsx`） | ステータスページ |

### 1-2. ルーティング構造（layout 配下）

- ルートグループ（`(site)` / `(map)` 等）は **未使用**。
- 公開ページは基本的に `app/layout.tsx` 配下。
- 例外として `app/internal/layout.tsx` があり、`/internal` 系のメタデータ（robots noindex）だけ上書き。

---

## 2. レイアウト構造の現状

### 2-1. 現在の共通レイアウト

`app/layout.tsx`

- `<body className="min-h-screen ...">`
- `<div className="flex min-h-screen flex-col">`
  - `<GlobalHeader />`
  - `<main className="flex-1">{children}</main>`
- **Footer は未実装**

### 2-2. ルート構造（ASCII）

```txt
app/layout.tsx (RootLayout)
└─ body.min-h-screen
   └─ div.flex.min-h-screen.flex-col
      ├─ GlobalHeader (components/GlobalHeader.tsx)
      └─ main.flex-1
         └─ 各ページ children

app/internal/layout.tsx
└─ return children (UIラッパーなし、metadata robots のみ)
```

### 2-3. Header 実装場所

- 共通ヘッダー: `components/GlobalHeader.tsx`（Client Component）
- ヘッダー高さを `--cpm-header-h` CSS変数に設定（ResizeObserver）

---

## 3. 既存フッター/類似UIの検索結果一覧

### 3-1. Footer 相当コンポーネントの有無

- `Footer`/`footer` 名の共通コンポーネントは確認できず。
- `components/layout/` ディレクトリ自体が存在しない（少なくとも現行ツリー上では未配置）。

### 3-2. 検索ヒット（主要）

| 種別 | ファイル:行 | 内容メモ |
|---|---|---|
| Contact導線 | `app/about/page.tsx:159` | 「Contact」セクション見出し |
| Contact導線 | `app/about/page.tsx:161` | 「contact form for quick reports」文言 |
| Contact導線 | `app/about/page.tsx:172` | 外部 Contact Form ボタン |
| Report導線 | `app/about/page.tsx:78` | 「Submit & Report」見出し |
| Report導線 | `app/about/page.tsx:91-92` | 誤情報等の報告導線説明 |
| Privacy文言 | `app/about/page.tsx:102` | 「Images & Privacy」見出し |

補足:
- `terms` / `privacy policy` / `copyright` / `built by` のフッター定番文言は、
  少なくとも公開ページにおいて独立フッターとしては未確認。
- `report` という語は submit 機能/APIにも大量ヒットするが、フッター用途ではない。

---

## 4. `/map` の特殊構造まとめ

### 4-1. 主要ファイル

- `app/map/page.tsx`（`MapClient` を返す）
- `app/page.tsx`（こちらも `MapClient` を返す）
- `components/map/MapClient.tsx`
- `components/map/map.css`
- `components/map/Drawer.tsx`
- `components/map/Drawer.css`
- `components/map/pc-map-card.css`

### 4-2. `/map` 除外判定に関わる事実

- `MapClient` は `usePathname` を使用（主用途はクエリ更新時の `router.replace`）。
- ただし「フッター表示可否」を判定する既存ロジックはなし。
- ルート側（`app/layout.tsx`）は Server Component のため、そこで pathname 判定を直接やるには工夫が必要（Client化/分割レイアウト化など）。

### 4-3. 高さ計算・全画面依存（副作用注意）

| ファイル:行 | 高さ依存ポイント |
|---|---|
| `components/map/MapClient.tsx:1109` | `height: calc(100dvh - var(--cpm-header-h, 64px))` |
| `components/map/MapClient.tsx:1111` | `--header-height` を style 注入 |
| `components/map/Drawer.tsx:60` | `height: calc(100vh - headerHeight)` |
| `components/map/Drawer.tsx:115` | 同上 |
| `components/map/Drawer.css:7` | `height: calc(100vh - var(--header-height, 0px))` |
| `components/map/pc-map-card.css:6` | `height: 100vh` |
| `components/GlobalHeader.tsx:20` | `--cpm-header-h` を動的更新 |

所見:
- map UI は「ヘッダー分を差し引いた縦幅占有」を前提に複数箇所で成立している。
- `/map` にフッターを誤表示すると、可視領域・スクロール・Drawerの高さ計算に波及する可能性が高い。
- さらに `/` も `MapClient` なので、「`/map` のみ除外」仕様だと `/` の扱いを明確化すべき。

---

## 5. 実装の入れ場所候補（A/B/C）と推奨

### A: `app/layout.tsx` に Footer を入れて `/map` のみ分岐
- 利点: ファイル追加少。
- 注意: RootLayout は Server Component。pathname 判定に Client 化や別コンポーネント介在が必要になり、
  レイアウト責務が混ざりやすい。
- さらに `/` が map 実装である現状と仕様整合を取りづらい。

### B: ルートグループで `(map)` と `(site)` を分離し、`(site)/layout.tsx` のみ Footer
- 利点: Next App Router の構造で責務分離が明確。
- `/map`（および必要なら `/`）を map グループへ寄せれば、判定ロジック不要。
- 将来の map 専用UI（全画面前提）維持にも相性が良い。

### C: 既存構造に追従
- 現状、`(site)/(map)` の既存分離はないため、そのまま追従案は実質 A に近い。

### 推奨（現状構造前提）

- **推奨: B（ルートグループ分離）**
- 根拠: map が高さ計算に強く依存しており、表示条件を「pathname分岐」より「レイアウト適用範囲」で固定した方が副作用を局所化しやすい。
- ただし「`/` を map と同扱いでフッター無しにするか」は事前合意が必要。

---

## 6. 落とし穴チェック結果

| チェック項目 | 結果 | 理由 |
|---|---|---|
| Root `layout.tsx` が Server/Client どちらか | 要注意 | `app/layout.tsx` は Server（`"use client"` なし）。pathname 分岐を直接置きにくい。 |
| Header が Client で `usePathname` を使っているか | OK（ただし別観点要注意） | `GlobalHeader` は Client だが `usePathname` は未使用。常時表示前提。 |
| `body/main` の `min-h-screen` と flex の有無 | OK | 既に `body.min-h-screen` + `div.flex.min-h-screen.flex-col` + `main.flex-1` 構造。 |
| Tailwind 利用状況（class/container/spacing規約） | OK | Tailwind は `app`/`components` を content 対象。ユーティリティ中心の実装。 |
| i18n（日英併記など） | 要注意（軽） | `app/layout.tsx` は `lang="en"` 固定。多言語基盤は見当たらず、文言追加時は英語基準で整合確認が必要。 |
| `/map` 依存CSS（h-screen/100vh/calc） | 要注意 | map関連で `100vh/100dvh/calc/header変数` に依存が集中。Footer混入時の崩れリスク高。 |

---

## 補足（監査としての結論）

- 現状は「共通 Header + 各ページ + Footer未実装」のシンプル構造。
- `/map` だけでなく `/` も map UI である点が最大の仕様確認ポイント。
- 変更時の最小リスクは、表示条件を if 分岐で増やすより、レイアウト境界（ルートグループ）で map と site を分離する方針。
