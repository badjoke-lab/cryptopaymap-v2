# CryptoPayMap v2 SEO P0-P1 再E2E監査（PR-A/PR-B マージ後）

実施日: 2026-02-25  
対象ブランチ: `main` 取得済みローカル相当（`/workspace/cryptopaymap-v2`）

## 実行環境
- サーバー起動: `npm run dev`（`http://localhost:3000`）
- 補助確認: `curl`（HTML head/meta確認）、Playwright（画面遷移・deep link動作）

## 検証サマリー

| # | チェック項目 | 判定 | 重大度 | 根拠メモ |
|---|---|---|---|---|
| 1 | `/` と `/map` のルーティング・主要UI | OK | P0 | `/`はH1=1・説明3行・CTA3種、`/map`は地図描画・ピン選択・Drawer開閉を確認 |
| 2 | metadata（`/`,`/map`,`/stats`,`/submit`,`/place/<valid>`） | OK | P0 | title/description/canonical/OG URL が自己参照で整合 |
| 3 | `/internal` noindex | OK | P0 | `/internal`,`/internal/submissions`で`robots: noindex, nofollow` |
| 4 | `/place` 実在ID検証（2件） | OK | P0 | valid=200、encoded valid=200、invalid=404、titleに`%3A`なし |
| 5 | `/place` → Open on Map 導線 | OK | P0 | クリックで`/map?place=<...>`へ遷移 |
| 6 | `/map` deep link（valid/invalid） | OK | P0 | validで自動選択+Drawer open、invalidで未選択化+`/map`へ置換 |
| 7 | `/place` JSON-LD（P1-3） | OK | P1 | `application/ld+json`あり、`LocalBusiness` + `BreadcrumbList`を確認 |
| 8 | `/place` 最小内部リンク（P1-4） | OK（条件付き） | P1 | 「Related places」は該当候補0件時に非表示。今回2IDとも同country/category候補0件で妥当 |

## 実測詳細

### 0) 事前
- `npm run dev` でローカル起動。
- `curl`で各ページのhead/metaを抽出して確認。

### 1) `/` と `/map`
- `/`
  - H1: 1件
  - 説明段落: 3行（要件2〜5行を満たす）
  - CTAリンク: `/map` `/discover` `/submit`
- `/map`
  - `#map`要素表示
  - Leaflet pane生成（7要素）
  - ピン表示（3件）
  - ピンクリックで`data-selected-place`セット、Drawer classが`open`
  - マウスドラッグでパン操作可能

### 2) metadata
対象URL:
- `/`
- `/map`
- `/stats`
- `/submit`
- `/place/cpm:newyork:community-diner-1`

確認結果:
- title/description/canonical/og:url がすべて存在
- canonical/og:url は対象URLと整合（自己参照）

### 3) `/internal` noindex
- `/internal`（307リダイレクト応答本文）
- `/internal/submissions`（200）

いずれも `<meta name="robots" content="noindex, nofollow">` を確認。

### 4) `/place` 実在ID
`/api/places` から取得した実在ID（2件）:
- `cpm:newyork:community-diner-1`
- `cpm:paris:directory-bistro-1`

各IDで:
- `/place/<id>` → 200
- titleに`%3A`等エンコード文字なし
- `/place/<url-encoded-id>` → 200

invalid:
- `/place/invalid-id-zzz` → 404

### 5) Open on Map
- `/place/cpm:newyork:community-diner-1` の `Open on Map` の`href`:
  - `/map?place=cpm%3Anewyork%3Acommunity-diner-1`
- クリック後URL:
  - `http://localhost:3000/map?place=cpm%3Anewyork%3Acommunity-diner-1`

### 6) `/map` deep link
- valid: `/map?place=cpm%3Anewyork%3Acommunity-diner-1`
  - `#map[data-selected-place] = cpm:newyork:community-diner-1`
  - Drawer class = `cpm-drawer open`
- invalid: `/map?place=invalid-id-zzz`
  - URLが`/map`へ置換（query除去）
  - `#map[data-selected-place] = ""`
  - Drawerはopenでない

### 7) JSON-LD
2IDとも`/place/<id>`で確認:
- `<script type="application/ld+json">`存在
- JSON-LD配列に `LocalBusiness` と `BreadcrumbList`
- 捏造情報は見当たらず（ページ表示データと整合）

### 8) 関連リンク
- 2IDとも「Related places」セクション非表示。
- `data/places.json`上で同一country/category候補数を確認し、いずれも0件。
- 実装条件（候補がある時のみ表示）に沿っており妥当。

## NG / 要調整
- なし（今回検証範囲では全項目OK）

