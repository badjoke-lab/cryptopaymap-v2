# stats v4.0 parity deltas audit (PR257 preview)

## 1) 実測条件（推測なし）
- 実行環境: PR257 preview 相当のローカル起動（`next dev`）
- Map母集合取得経路:
  - `/api/places` は `all=1` パラメータを持たない。
  - 全件取得は `limit` 上限付きで行う実装（`MAX_LIMIT=5000`）のため、`/api/places?limit=5000` を母集合取得に使用。
- Stats取得経路:
  - `/api/stats`（Filters=All のデフォルト）

実行コマンド:
```bash
curl -s -i "http://localhost:3000/api/places?limit=5000"
curl -s -i "http://localhost:3000/api/stats"
```

実測ヘッダ/ステータス:
- `/api/places?limit=5000`: `200`, `x-cpm-data-source: json`, `x-cpm-limited: 1`
- `/api/stats`: `503`, `x-cpm-data-source: json`, `x-cpm-limited: 1`

## 2) Map母集合で再計算した値 vs Stats API値

> Map側再計算は `/api/places?limit=5000` の返却配列を母集合として集計。

| 項目 | Map母集合で計算 | Stats API | 差分 | 判定 |
|---|---:|---:|---:|---|
| total_places | 5 | 0 | +5 | 非0 |
| countries (distinct) | 5 | 0 | +5 | 非0 |
| cities (country+city distinct) | 5 | 0 | +5 | 非0 |
| categories (distinct) | 5 | 0 | +5 | 非0 |
| breakdown.owner | 2 | 0 | +2 | 非0 |
| breakdown.community | 1 | 0 | +1 | 非0 |
| breakdown.directory | 1 | 0 | +1 | 非0 |
| breakdown.unverified | 1 | 0 | +1 | 非0 |

### top chains / top assets（Top N キー＋件数）

Map（Top4）:
- BTC: 4
- ETH: 2
- Lightning: 2
- USDT: 1

Stats（Top N）:
- top_chains: `[]`
- top_assets: `[]`

差分判定: **非0（全キー欠落）**

### asset acceptance matrix
- Map母集合由来（`accepted` 配列から再構成）
  - セル合計: 9
  - 行合計: 9
- Stats API
  - `asset_acceptance_matrix.rows: []`
  - セル合計: 0
  - 行合計: 0

差分判定: **非0**

## 3) 不一致原因の分類（A〜E）

### 総論
今回の不一致は **E: limited/fallback混在** が支配的。
- `/api/places` は DB 不可時に JSON fallback で母集合を返す。
- `/api/stats` は DB 不可 or 非DBモード時に limited レスポンス（全0/空）を返す。
- 結果として、Map側は実データ件数を保持、Stats側は0件となり全指標が乖離。

### 項目別分類
- `total_places / countries / cities / categories`: **E**
- `verification breakdown`: **E**（今回の実測差分は fallback 由来）
- `top_chains / top_assets`: **E**（fallback で空配列）
- `asset_acceptance_matrix`: **E**（fallback で空行列）

## 4) 疑わしいコード箇所（ファイル+行番号）

### E（今回の主因）
- `/api/stats` が DB不可/非DB時に即 limited 503 を返す経路:
  - `app/api/stats/route.ts:514-519`（`if (!hasDb || !shouldAttemptDb)` → `limitedResponse("fallback")`）
- `/api/stats` limited レスポンスは全メトリクス0/空を固定:
  - `app/api/stats/route.ts:146-169`（`limitedResponse` 定義）
- `/api/places` は JSON fallback で実データを返す経路:
  - `app/api/places/route.ts:830-837`（JSON許可判定と `loadPlacesFromJson()`）
  - `app/api/places/route.ts:842-900`（JSON母集合のフィルタ→返却）

### A/B/C/D（今回は「差分の直接主因ではない」が再発監視対象）
- A: distinct正規化（`BTRIM/NULLIF` と JSON側の文字列処理差）
  - `app/api/stats/route.ts:279-289`（distinct算出SQL）
  - `app/api/places/route.ts:847-857`（JSON fallback 条件比較）
- B: verification 正規化
  - `lib/population/mapPopulationWhere.ts:22-28`（`normalizeVerificationSql`）
  - `app/api/places/route.ts:368-370, 418-426`（verification select/filter）
- C: accepted 抽出定義（asset/chainの扱い）
  - `app/api/stats/route.ts:211-220, 364-421`（`payment_accepts` 集計条件）
  - `app/api/places/route.ts:859-862, 890-893`（JSON側 accepted ベース抽出）
- D: promoted/source フィルタ
  - `app/api/stats/route.ts:195-196`（`buildMapPopWhereClause`）
  - `app/api/places/route.ts:330-341, 847-857`（DB/JSON それぞれのフィルタ条件）

## 5) 結論
- PR257 preview 実測では、**Map母集合そのものの定義不一致ではなく、レスポンスモード差（E）により全項目がズレる**。
- ズレは件数/内訳/TopN/Matrix の全レイヤーで確認でき、差分はすべて非0。

## 6) 修正後再検証（このPR）
ローカル再検証（`/api/places?limit=5000` vs `/api/stats`）で、以下はすべて差分0:
- total_places
- countries / cities / categories
- verification breakdown（owner/community/directory/unverified）
- top chains / top assets（キーと件数）
- asset_acceptance_matrix（セル合計）

また、`/api/stats?debug=1` で `meta.debug` が追加され、
`normalization_version` と `sample_mismatches` を返すことを確認した。
