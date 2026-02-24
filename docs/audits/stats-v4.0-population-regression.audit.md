# stats-v4.0 population regression audit

- 作成日: 2026-02-24
- 監査対象: `/api/places` と `/api/stats` の「母集合（population）」整合性
- 比較指定: `c034590` → `main HEAD`
- 監査実行ブランチ: `work` (`HEAD=2f663dc3d5864ff6c409bdf4413d2fb87edac1f2`)

## 0) 前提確認（推測排除）

本リポジトリ内では指定コミット `c034590` を解決できず、`git show -s --oneline c034590` は `unknown revision` で失敗した。したがって、**この監査は「現リポジトリで参照可能な履歴」だけを根拠**に作成する。

- 参照可能な母集合統一コミット: `366eb16de6decc4b6aa285243a3bd876640b6c1c`（PR #253: *Align stats base population with map-displayable places*）
- その後、監査対象ファイルを更新したコミット: `2f663dc3d5864ff6c409bdf4413d2fb87edac1f2`（PR #254）

---

## 1) 「母集合WHERE」を触っているコミット/PR（現履歴で確認可能な範囲）

### PR #253 / commit `366eb16...`

**変更点（母集合統一）**

1. 共通ヘルパ `getMapDisplayableWhereClauses` / `isMapDisplayablePlace` を新規追加。  
   - `lat IS NOT NULL` かつ `lng IS NOT NULL` を母集合条件として定義。 (`lib/stats/mapPopulation.ts`)
2. `/api/places` が直接 `p.lat IS NOT NULL` + `p.lng IS NOT NULL` を書く実装から、共通ヘルパ呼び出しに変更。
3. `/api/stats` が `buildFilteredPlacesCte()` を導入し、全集計の基底 CTE に `getMapDisplayableWhereClauses("p")` を注入。
4. JSON fallback 側も `isMapDisplayablePlace` で同一母集合条件を適用。

### PR #254 / commit `2f663dc...`

**変更点（母集合WHEREの変更は無し）**

- `breakdown` フィールド追加、verification 正規化ロジック改善、`verifications` 取得を `LEFT JOIN` から `LEFT JOIN LATERAL` + 優先順位選択へ変更。
- `buildFilteredPlacesCte` と `getMapDisplayableWhereClauses` を使う構造は維持され、**母集合の WHERE 自体は変更されていない**。

---

## 2) `/api/stats` 各集計が同一WHEREを参照しているか

### 2-1. 同一母集合を参照している集計（DB経路）

`buildFilteredPlacesCte(whereClause)` が `getMapDisplayableWhereClauses("p")` + 動的フィルタを合成し、`WITH filtered_places AS (...)` を作る。以降の集計クエリはこの CTE を起点にしている。

- `total_places/countries/cities/categories`: `FROM filtered_places`
- `verification breakdown`: `FROM filtered_places p` + lateral verification
- `category_ranking/country_ranking/city_ranking`: `FROM filtered_places`
- `top_chains/top_assets/accepting_any_count/matrix`: `payment_accepts` と `INNER JOIN filtered_places fp ON fp.id = pa.place_id`

**結論**: DB経路の v4 集計（total/breakdown/rankings/chains/matrix）は、実装上は同一の母集合 CTE を参照している。

### 2-2. 同一母集合を参照していない（または性質が異なる）経路

1. `stats_cache` 読み取りは `stats_cache` テーブルのスナップショット値を読む（母集合WHEREを実行しない）。
2. ただし `loadStatsFromDb()` は `responseFromCache(rows[0])` に `...(await v4StatsPromise)` を後勝ち merge しており、v4側が返す項目で上書きされる。
3. JSON fallback (`responseFromPlaces`) は DB クエリではないが、`isMapDisplayablePlace` と同種フィルタで母集合を構築する。

**結論**: `/api/stats` 内で「同一WHEREを直接実行しない」経路は `stats_cache` と JSON fallback。v4主要項目は merge 後に v4結果で揃う構造。

---

## 3) 不一致を起こしうる経路の分類（A/B/C）

## A: 集計ごとに母集合が分裂するか

### 判定: **現HEAD実装では、/api/stats 内の v4集計同士は分裂しない**

理由:
- `buildFilteredPlacesCte` が単一の母集合 CTE を作り、total/breakdown/rankings/chains/matrix がそれを共有するため。

ただし注意点:
- `/api/places` は `LEFT JOIN verifications v ON v.place_id = p.id` を直接使う。
- `/api/stats` は verification 算出で `LEFT JOIN LATERAL (...) LIMIT 1` を使う。
- よって verification の解釈（特に複数 verification 行がある place）では、Map と Stats で扱いが一致しない可能性がある。

## B: stats_cache / fallback 混在で母集合が変わるか

### 判定: **構造上の混在経路は存在するが、主要v4項目は v4 で上書きされる**

- `stats_cache` は WHERE を再評価しない別ソース。
- しかし `loadStatsFromDb` の戻り値は `cache/fallback` + `v4StatsPromise` の合成で、v4で提供される項目（total/breakdown/rankings/chains/matrix 等）は最終的に v4 値が優先される。

## C: Map と Stats でフィルタ解釈が異なるか

### 判定: **差異あり（確定）**

1. **verification フィルタ解釈差**
   - `/api/places`: `COALESCE(v.level, 'unverified') = ANY(...)`（`LEFT JOIN verifications v`）
   - `/api/stats`: サブクエリ/LATERAL で verification を正規化し、`owner > community > directory > unverified` 優先の1件を選んで比較。
   - 結果として、同一 place に複数 verification 行がある場合、Map と Stats の filtering/集計一致が崩れうる。

2. **accepted フィルタは両者とも `payment_accepts` を参照**するが、
   - `/api/places`: `LOWER(pa.asset) = ANY(...) OR LOWER(pa.chain) = ANY(...)`
   - `/api/stats`: `LOWER(NULLIF(BTRIM(COALESCE(pa.chain,'')),'')) = LOWER($x)` 等（trim/nullifを含む）
   - 空白や空文字の扱いで厳密一致しないケースがありうる。

3. country/city/category は双方とも places カラムの一致比較を使うが、`/api/stats` 側は `NULLIF(BTRIM(...),'')` ベースで空文字正規化している箇所が多く、実データ品質によって差が出る余地がある。

---

## 4) 「どのPR/コミットで」「どの集計が」「どのWHERE/ソースに変わったか」結論

1. **母集合統一を導入した変更**は PR #253 (`366eb16...`)。  
   `/api/stats` に `buildFilteredPlacesCte + getMapDisplayableWhereClauses` が導入され、v4集計の基底母集合が共通化された。
2. **PR #254 (`2f663dc...`) では母集合WHEREは変更されていない**。変更は verification 集計ロジック（LATERAL化と正規化）とレスポンス項目の整理が中心。
3. **不一致の確定原因候補（コード差分から確定できる差分）**は、母集合WHEREの分裂ではなく、
   - Map と Stats の verification 解釈差（JOIN方式・優先順位）
   - 文字列正規化差（accepted/country/city/category のtrim/null処理差）
   にある。

> 監査結論（確定）: 現在参照可能な履歴では、`/api/stats` v4 集計内の total/breakdown/rankings/chains/matrix が別母集合WHEREへ分裂したコミットは確認できない。  
> 一方、Map と Stats のフィルタ/verification 解釈差は実装上残っており、母集合不一致の実発生経路になりうる。

