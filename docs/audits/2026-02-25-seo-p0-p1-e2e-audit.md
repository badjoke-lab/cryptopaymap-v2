# CryptoPayMap v2 SEO P0-P1 実装監査（2026-02-25）

## 監査スコープと前提
- 依頼は `https://www.cryptopaymap.com` 本番E2E監査だが、実行環境から本番ドメインへの HTTP(S) 到達が `403 (CONNECT tunnel failed)` で不可。
- そのため、同一リポジトリの最新コードを `next dev` で起動し、`http://localhost:3000` で代替E2E確認を実施。

### 実行した主な確認コマンド
- `curl -I https://www.cryptopaymap.com/`
- `npm run dev -- --hostname 0.0.0.0 --port 3000`
- `curl -sS -D ... http://localhost:3000/...`
- `python` による title/description/og/canonical/robots/H1 抽出
- Playwright（browser tool）による `/map?place=...` 深いリンク確認

---

## 1) ルーティング確認（/ /map）
### 判定: **要調整**
- `/` は 200 で Home 表示。H1 は1つ（`Find places that accept crypto`）。
- Home CTA の `/map` `/discover` `/submit` は HTML 上に存在。
- `/map` は 200（404/500 ではない）。
- ただし「旧 `/` の地図体験が `/map` にあること」は UI/仕様比較の完全確認が本番未到達のため限定的。

## 2) metadata 確認（/ /map /stats /submit /place/<id>）
### 判定: **要調整（/place はNG相当）**
- `/` `/map` `/stats` `/submit` は title/description/og/canonical が自己参照で整合。
- canonical が全ページ同一固定の問題は再現せず。
- **`/place/<valid-id>` が 404 のため、ページ固有 metadata を本来形で検証不能。**
- 404応答の head では `Place cpm%3A... details` のように id がURLエンコード済み文字列のまま扱われる兆候あり（後述の原因推定と一致）。

## 3) noindex 確認（/internal）
### 判定: **OK**
- `/internal`（最終 `/internal/submissions`）、`/internal/submissions`、`/internal/submissions/mock-id` いずれも `meta name="robots" content="noindex, nofollow"` を確認。

## 4) robots.txt / sitemap.xml
### 判定: **OK**
- `/robots.txt` 200。
- `/sitemap.xml` 200。
- sitemap `loc` に `/` `/map` `/stats` `/submit` を含む。
- `/internal/*` は含まれない。
- `/place/*` は静的 sitemap から意図的除外（コメント明記あり）で、現状方針として妥当。

## 5) /place/[id] の実在ID検証
### 判定: **NG（P0）**
- 実在IDは `/api/places` から取得可能（例: `cpm:newyork:community-diner-1`）。
- しかし `/place/cpm:newyork:community-diner-1`、`/place/cpm:tokyo:owner-cafe-1` はいずれも 404。
- 期待仕様（詳細ページ表示、H1/カテゴリ/accepted/note/address 表示、Open on Map）を満たせない。
- 不正IDの404は出るが、正IDも404のため要件未達。

## 6) deep link（/map?place=...）
### 判定: **要調整**
- valid id: `/map?place=cpm:newyork:community-diner-1`
  - 初期ロード後 `#map[data-selected-place="cpm:newyork:community-diner-1"]` を確認（自動選択は動作）。
- invalid id: `/map?place=this-does-not-exist`
  - クラッシュはしない（フォールバック耐性あり）。
  - ただし `data-selected-place="this-does-not-exist"` のまま Drawer が open 状態となり、完全な「通常地図へフォールバック（未選択化）」にはなっていない。

## 7) /place の JSON-LD
### 判定: **NG（P0に連動）**
- `/place/<valid-id>` に到達できず、実ページHTMLで JSON-LD 出力確認不可。
- 実装コード上は `LocalBusiness` + `BreadcrumbList` を出力する記述あり。
- しかし到達不能のため、運用観点では未達扱い。

## 8) 最小内部リンク確認（/place related block）
### 判定: **NG（P0に連動）**
- `/place/<valid-id>` 到達不能のため、関連リンクブロック（same country/category）の実表示確認不可。
- 実装コード上は候補がある場合のみ表示する条件分岐あり。

---

## 9) まとめ（OK/NG/要調整 一覧）
- 1) ルーティング（/ /map）: **要調整**
- 2) metadata/canonical/OG: **要調整**（`/place`未検証）
- 3) /internal noindex: **OK**
- 4) robots/sitemap: **OK**
- 5) /place 実在ID表示: **NG (P0)**
- 6) deep link: **要調整**（invalid id時の未選択フォールバック不足）
- 7) /place JSON-LD: **NG (P0連動)**
- 8) /place 内部リンク: **NG (P0連動)**

---

## NG/要調整 詳細

### A. `/place/<valid-id>` が 404（P0）
- 再現手順
  1. `GET /api/places?limit=5` で実在 id を取得（例 `cpm:newyork:community-diner-1`）。
  2. `GET /place/cpm:newyork:community-diner-1`。
  3. 404（`Page not found`）。
- 期待仕様
  - 実在IDなら詳細ページが表示される。
- 実際
  - 正IDでも404。
- 原因推定
  - `app/place/[id]/page.tsx` は `params.id` をそのまま `getPlaceDetail(id)` に渡している。
  - 一方、URLセグメントは `%3A` を含む形で渡されるため、`cpm%3A...` と `cpm:...` が不一致になって検索失敗。
  - 同リポジトリの `app/api/places/by-id/route.ts` では `decodeURIComponent` 実施済みで、実装差分がある。
- 最短修正案
  - `/place/[id]` でも `decodeURIComponent(params.id)` を安全に適用してから `getPlaceDetail` と metadata生成に渡す。
  - 例: `const id = safeDecode(params.id)` を導入（decode失敗時は raw 維持）。

### B. `/map?place=<invalid>` のフォールバック挙動（P1）
- 再現手順
  1. `GET /map?place=this-does-not-exist` を開く。
  2. 初期描画後、`data-selected-place` が invalid id のまま。
  3. Drawer が open で、通常未選択状態に戻らない。
- 期待仕様
  - 無効IDなら落ちずに通常地図へフォールバック（未選択）。
- 実際
  - 非クラッシュだが、選択状態が残り Drawer open。
- 原因推定
  - `selectedPlaceParam` を無条件で `selectedPlaceId` に採用しており、placesロード後の存在確認で解除していない。
- 最短修正案
  - placesロード後に `selectedPlaceId` が一覧に存在しなければ `setSelectedPlaceId(null); setIsPlaceOpen(false);`。
  - URLクエリの `place` も同期削除（既存の replace ロジックで対応可能）。

---

## 追加で気づいたSEO事故候補（優先度）
- **P0:** `/place/*` 正常到達不可により、詳細ページのインデックス価値（content / JSON-LD /内部リンク）が実質喪失。
- **P1:** invalid deep link の未選択フォールバック不十分（UX/クローラ誘導整合性に軽微影響）。

