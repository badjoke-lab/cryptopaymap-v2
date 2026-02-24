# Stats 現状監査レポート（現行 main 相当ワークツリー）

> 方針: 本レポートは**推測なし**で、実装コード・Git履歴・実行コマンド結果のみを根拠に記載する。

## 0) 前提の確定（必須）

### 0-1. `origin/main` HEAD SHA
- 実行コマンド: `git rev-parse origin/main`
- 結果: `fatal: ambiguous argument 'origin/main': unknown revision ...`
- 断定: 本ローカルリポジトリには `origin` リモート/`origin/main` 参照が存在しないため、**origin/main の HEAD SHA は断定不可**。

### 0-2. `git log -n 5 --oneline`
- `git log -n 5 --oneline origin/main` は上記理由で実行不能。
- 代替として `git log --oneline -n 5` は以下（ローカル `work` ブランチ）:
  1. `94ba666 docs: audit PR253-to-main population definition regression (#256)`
  2. `2f663dc Implement stats v4 verification breakdown parity and UI (#254)`
  3. `366eb16 Align stats base population with map-displayable places (#253)`
  4. `ac40acd Add external links ... (#252)`
  5. `e45d861 docs: recreate TASK-D stats v4.0 parity PR split plan (#251)`

## 1) 直近の Stats 関連マージPR番号とコミット（main履歴由来）

`git log --merges --oneline | rg "stats|Stats"` で抽出できる直近例:
- `#132` / `7d9ded1 Merge pull request #132 ... fix-stats-page-hooks-order`
- `#130` / `6a39fc0 Merge pull request #130 ... stable-cached-aggregates-for-/api/stats`
- `#120` / `157406f Merge pull request #120 ... fix-stats-api-to-return-minimum-metrics`
- `#119` / `44c60d2 Merge pull request #119 ... implement-stable-api-for-/stats`
- `#81` / `0be445d Merge pull request #81 ... db-backed-stats-and-trends-endpoints`

※ ただし 0) の通り `origin/main` を直接参照できないため、**ローカル履歴に存在する merge commit からの抽出**。

---

## A. Statsの母集合（最重要）

## 2) `/api/stats` が参照する母集合の実体

### 結論
- DB経路の母集合: `places` テーブルを起点に作る `filtered_places` CTE。
- JSON経路の母集合: `data/places.json` をロードした配列。
- `submissions` / `history` は `/api/stats` スナップショット集計本体の母集合としては使っていない（`/api/stats/trends` は `history` 使用）。

### 根拠（DB）
- `filtered_places` は `FROM places p` を起点に構築。`WHERE` は map 表示可能条件 + フィルタ条件の合成。  
  `buildFilteredPlacesCte` 内: `SELECT p.id, p.country, p.city, p.category FROM places p WHERE ${combinedWhere}`。【app/api/stats/route.ts:373-382】
- `combinedWhere` は `getMapDisplayableWhereClauses("p")`（lat/lng not null）と `buildFilterSql` で組み立てた条件を AND 結合。【app/api/stats/route.ts:374-377】【lib/stats/mapPopulation.ts:6-9】

### 根拠（JSON fallback）
- `loadPlacesFromJsonFallback()` が `data/places.json` を読み込む。【app/api/stats/route.ts:219-227】
- `responseFromPlaces()` が JSON 配列を `isMapDisplayablePlace(place)` と query filter で絞り込み母集合化する。【app/api/stats/route.ts:229-248】

## 3) `/api/stats` 内で集計ごとに母集合が分裂していないか

### 結論
- DB生集計ブロック（v4）の主要指標は、同一 `filtered_places` CTE を参照しており、母集合起点は共通。
- ただし**レスポンス合成時に `stats_cache`（total/countries/cities/chains/categories）と v4 live値をマージ**しており、最終レスポンスの値の出所が分裂する。

### 項目別
- `total_places`: `totalsPromise` の `COUNT(*) FROM filtered_places` を使用。【app/api/stats/route.ts:498-509】【app/api/stats/route.ts:693-699】
- `breakdown`: `verificationPromise` が `FROM filtered_places p` + `verifications` LATERAL で算出。【app/api/stats/route.ts:513-534】【app/api/stats/route.ts:655-666】
- `countries/cities/categories`: `totalsPromise` 同一SQL内で `filtered_places` から算出。【app/api/stats/route.ts:498-508】
- `category/country/city rankings`: 各Promiseとも `FROM filtered_places`。【app/api/stats/route.ts:536-581】
- `chains/assets`: `payment_accepts` を `INNER JOIN filtered_places fp`。【app/api/stats/route.ts:583-611】
- `matrix`: `payment_accepts` を `INNER JOIN filtered_places fp`。【app/api/stats/route.ts:626-640】

### 出所分裂（重要）
- 無フィルタかつ `stats_cache` がある場合、`responseFromCache(rows[0])`（total系・chains等）に `v4StatsPromise` を上書きマージ。【app/api/stats/route.ts:843-860】
- `responseFromCache()` には `breakdown/top_assets/rankings/matrix` は空固定があり、v4側が埋める設計。【app/api/stats/route.ts:196-217】

---

## B. “total=5”等の異常値の発生源

## 4) “5/EMPTY_STATS/fixture/ダミー”生成経路

### total=5
- `/api/stats` が JSON fallback 経路に入ると `data/places.json` を母集合にする。【app/api/stats/route.ts:882-887】【app/api/stats/route.ts:918-923】
- `data/places.json` は実データ件数が5件（かつ5件ともlat/lng有効）。【data/places.json:1-124】
- 実コマンド確認:
  - `node -e "..."` 実行結果 `len 5` / `displayable 5`。

### EMPTY_STATS
- API側: `limitedResponse()` が0埋めレスポンスを返す（API fallback）。【app/api/stats/route.ts:176-194】
- UI側: `EMPTY_STATS` はクライアントの表示用既定値で、`safeFetch`失敗時に直近成功値がなければこれを利用。【app/(site)/stats/StatsPageClient.tsx:125-156】【app/(site)/stats/StatsPageClient.tsx:475-480】

### fixture/ダミー
- このリポジトリ内で `/api/stats` が fixture を読む実装は確認できず（`tests/fixtures/places.sample.json` は map test 用）。断定できる `/api/stats` のデータ源は DB または `data/places.json` のみ。

## 5) その経路が発動する条件

- `shouldAttemptDb=false`（`DATA_SOURCE=json` または DB未設定等）で即JSON経路。【lib/dataSource.ts:33-40】【app/api/stats/route.ts:872-885】
- DB経路で例外（`DbUnavailableError`, `DATABASE_URL`問題, timeout含む）かつ `shouldAllowJson=true` ならJSON fallback。【app/api/stats/route.ts:897-923】
- DB専用設定 (`DATA_SOURCE=db`) でDB不可の場合は JSON fallbackせず 503 + limitedResponse。【app/api/stats/route.ts:875-880】【app/api/stats/route.ts:911-916】
- JSON読込失敗時は 503 + limitedResponse。【app/api/stats/route.ts:888-894】【app/api/stats/route.ts:924-929】

## 6) fallback値がキャッシュ保存され復帰不能になる経路

### 結論
- `/api/stats` 実装内で fallback値を `stats_cache` に**書き込むコードは確認不可**（読み取りのみ）。
- HTTPキャッシュ（CDN/edge）による一時保持はある（`Cache-Control`）。

### 根拠
- `stats_cache` 参照は `SELECT ... FROM stats_cache` のみ。【app/api/stats/route.ts:844-853】
- リポジトリ検索でも `INSERT/UPDATE stats_cache` はドキュメント以外に存在しない。  
  (`rg "INSERT INTO stats_cache|UPDATE stats_cache"`)
- `/api/stats` レスポンスは `Cache-Control: public, s-maxage=7200, stale-while-revalidate=600`。【app/api/stats/route.ts:72】【app/api/stats/route.ts:886-903】

---

## C. Map側の“表示可能集合”の必須条件（bbox無視）

## 7) `/api/places` の必須条件（WHERE）

### DB経路
- `where.push(...getMapDisplayableWhereClauses("p"))` で必須条件を常に追加。【app/api/places/route.ts:337】
- `getMapDisplayableWhereClauses("p")` は `p.lat IS NOT NULL` と `p.lng IS NOT NULL`。【lib/stats/mapPopulation.ts:6-9】

### JSON経路
- `isMapDisplayablePlace(place)` を通過必須。数値かつ有限値の `lat/lng` を要求。【app/api/places/route.ts:838-841】【lib/stats/mapPopulation.ts:11-17】

## 8) Map母集合必須条件 vs Stats母集合必須条件（差分）

### 必須条件の一致
- 両者とも母集合の必須条件は map表示可能条件（lat/lng 有効）で一致。
  - Stats DB: `buildFilteredPlacesCte` 内で `getMapDisplayableWhereClauses` を合成。【app/api/stats/route.ts:373-382】
  - Stats JSON: `isMapDisplayablePlace`。【app/api/stats/route.ts:229-232】
  - Map DB/JSON: 同じ関数群を使用。【app/api/places/route.ts:337】【app/api/places/route.ts:838-841】

### ただし運用差
- Mapは `bbox/limit/offset/search` を適用するAPI。Statsは集計APIであり、bbox/limitはない（本タスクではbbox無視）。
- 無フィルタ時 Stats は `stats_cache` 読み込み分岐を持つため、値の鮮度/出所がMapと非対称になり得る。【app/api/stats/route.ts:843-860】

---

## D. 「承認済み」の現行定義（mainでの事実）

## 9) 現行mainでの「承認済み」定義

### 結論
- internal moderation の `approve` は**submissions.status を approved にするのみ**で、placesは更新しない。【app/api/internal/submissions/[id]/approve/route.ts:114-116】
- map/stats が数える集合は `places`（+lat/lng条件）起点であり、submissionsの `approved` 自体は母集合条件に使っていない。【app/api/stats/route.ts:378-382】【app/api/places/route.ts:452-455】
- よって「表示・集計対象として数えられる」意味では、実装上は**placesに存在すること**が必要。

### published / stage の使用有無
- `/api/stats`・`/api/places` の母集合条件に `published` / `stage` 条件は見当たらない（少なくとも当該ルート内では未使用）。
- `promoted` / `source` は stats の任意フィルタとしては存在する（必須条件ではない）。【app/api/stats/route.ts:409-410】

## 10) unverified/owner/community/directory 内訳の表現フィールド

- DB経路:
  - `verifications.level` 優先、なければ `verifications.status` を探索し、正規化CASEで owner/community/directory 以外を unverified 化。【app/api/stats/route.ts:458-465】【app/api/stats/route.ts:360-366】
- JSON経路:
  - `place.verification` 文字列を owner/community/directory 以外は unverified 扱いで集計。【app/api/stats/route.ts:314-319】

---

## E. API契約（型）とUI参照の整合

## 11) `StatsApiResponse` 必須フィールドと route.ts return 一致

### 型（route.ts内）
- 必須: `total_places,total_count,countries,cities,categories,chains,breakdown,verification_breakdown,top_chains,top_assets,category_ranking,country_ranking,city_ranking,asset_acceptance_matrix,accepting_any_count`（`generated_at`,`limited`はoptional）。【app/api/stats/route.ts:28-61】

### 実装一致
- `limitedResponse` が上記必須項目をすべて初期化して返す。【app/api/stats/route.ts:176-194】
- `responseFromCache`, `responseFromDbFallback`, `fetchDbSnapshotV4` 合成後も必須項目は埋まる設計。【app/api/stats/route.ts:196-217】【app/api/stats/route.ts:831-839】【app/api/stats/route.ts:693-712】

## 12) `StatsPageClient.tsx` 参照フィールドとの一致

### 一致している参照
- UIは `total_places,countries,cities,categories,breakdown/verification_breakdown,top_chains,chains,top_assets,rankings,asset_acceptance_matrix,generated_at,limited` を参照。【app/(site)/stats/StatsPageClient.tsx:590-673】
- いずれも `/api/stats` の型/返却に存在する。

### 不一致
- APIは `accepting_any_count` を返すが、`StatsResponse` 型（UI側）にこのフィールドがない・参照もない。  
  API型定義あり:【app/api/stats/route.ts:58】  
  UI型定義なし:【app/(site)/stats/StatsPageClient.tsx:10-42】
- `0/NaN` 落ちについて: UI側は `Number(... ?? 0)` で防御しており、該当参照箇所では NaN 回避意図が確認できる。【app/(site)/stats/StatsPageClient.tsx:602-605】【app/(site)/stats/StatsPageClient.tsx:613-614】【app/(site)/stats/StatsPageClient.tsx:647-650】

---

## F. キャッシュ/ランタイム起因の“直っても戻る”要因

## 13) Cache-Control

- `/api/stats`: `public, s-maxage=7200, stale-while-revalidate=600`。【app/api/stats/route.ts:72】
- `/api/stats/trends`: `public, s-maxage=300, stale-while-revalidate=60`（成功経路で付与）。【app/api/stats/trends/route.ts:39】【app/api/stats/trends/route.ts:339-343】

## 14) runtime（node/edge）とDB接続相性

### 事実
- `/api/stats` と `/api/stats/trends` には `export const runtime = ...` 宣言なし。【app/api/stats/route.ts:1-16】【app/api/stats/trends/route.ts:1-39】
- `next.config.js` に runtime 強制設定なし。【next.config.js:1-20】
- DB層は `pg` (`Pool`) を直接利用。【lib/db.ts:1-2】【lib/db.ts:120-122】

### 断定
- このリポジトリ内コードだけでは、デプロイ環境で最終的にどの runtime が適用されるかは**断定不可**。
- ただし `/api/stats*` がDBアクセス時に `lib/db.ts` を通る事実は確定。

---

## G. Mapと一致させる対象指標の差分表

| 指標 | Map母集合での定義/値 | Statsでの定義/値 | 差分（事実） |
|---|---|---|---|
| total_places | Map APIは place 配列返却。母集合必須条件は lat/lng有効 + 任意フィルタ（bbox等は範囲条件）。【app/api/places/route.ts:321-337】【lib/stats/mapPopulation.ts:6-9】 | `filtered_places` の `COUNT(*)`（DB）または JSON fallback件数。【app/api/stats/route.ts:498-502】【app/api/stats/route.ts:229-232】 | 母集合条件は同じ関数由来で一致。無フィルタ時は `stats_cache` 利用で出所分裂あり。【app/api/stats/route.ts:843-860】 |
| verification breakdown（4クラス） | Mapレスポンスに `verification` を含む（DBは verifications join、JSONは place.verification）。【app/api/places/route.ts:364-370】【app/api/places/route.ts:839-864】 | Statsは owner/community/directory/else→unverified で集計。【app/api/stats/route.ts:360-366】【app/api/stats/route.ts:655-666】 | 定義は概ね整合（正規化ロジックあり）。 |
| countries/cities/categories distinct | Map API自体は distinct値を返さない。 | Statsは `COUNT(DISTINCT ...)` を `filtered_places` から算出。【app/api/stats/route.ts:502-508】 | Map API出力だけで値一致の数値断定は不可（定義比較は可）。 |
| rankings（country/city/category） | Map API自体はランキングを返さない。 | `filtered_places` から group by/desc で算出。【app/api/stats/route.ts:536-581】 | Map APIだけでは直接比較不可（定義比較のみ）。 |
| top chains / top assets | Map APIは accepted配列を返すがランキングは返さない。【app/api/places/route.ts:115-117】【app/api/places/route.ts:498-519】 | `payment_accepts` を `filtered_places` に joinして集計。【app/api/stats/route.ts:583-611】 | 値の直接比較は追加計算が必要（本監査では未実施）。 |
| matrix | Map APIに matrix は存在しない。 | `payment_accepts(asset,chain)` を `filtered_places` joinして集計。【app/api/stats/route.ts:626-640】 | Map側に同等レスポンスなし。定義比較のみ。 |

### matrix整合（セル合計=全体合計）
- 実装は matrix 用に `row.total += total` を積み上げるが、`total_places` との整合チェックは実装されていない。【app/api/stats/route.ts:679-690】
- よって「セル合計=全体合計」を現行実装が保証しているとは断定不可。

---

## H. “total=5”等への監査結論（要約）

1. `/api/stats` は DB失敗または JSONモード時に `data/places.json`（5件）へフォールバックするため、`total_places=5` が発生し得る。これは実装で再現可能な事実。  
   根拠: JSON fallback分岐 + `data/places.json` 件数。【app/api/stats/route.ts:882-887】【app/api/stats/route.ts:918-923】【data/places.json:1-124】
2. `stats_cache` は読み取り専用で、fallback値を永続書込する経路は本リポジトリ内で確認できない。  
   根拠: SELECTのみ、INSERT/UPDATE未検出。【app/api/stats/route.ts:846-853】
3. Map母集合条件（lat/lng有効）とStats母集合条件は同一関数群由来で一致。ただしStatsは `stats_cache` 併用で値出所が混在し得る。  
   根拠: `getMapDisplayableWhereClauses` / `isMapDisplayablePlace` 共通利用。【lib/stats/mapPopulation.ts:6-17】【app/api/places/route.ts:337】【app/api/stats/route.ts:374】

---

## I. 断定不可事項と追加調査

- `origin/main` 固定の監査（SHA・ログ）: リモート参照が存在しないため断定不可。追加調査には `origin` の設定/フェッチが必要。
- 本番/ステージング実レスポンス断片の提示: この監査ではコード静的解析中心。実環境API応答との差分断定には、対象環境URLで `/api/stats` `/api/places` 実測が必要。
- runtime最終適用値（node/edge）: repo内設定だけでは断定不可。デプロイ設定（platform/project config）確認が必要。
