# Stats Acceptance Parity Audit (Map vs Top chains / Asset Matrix)

- Date: 2026-02-24
- Scope: `Map` の表示母集合と、`/api/stats` の `top_chains` / `asset_acceptance_matrix` 集計母集合の分裂点特定
- Constraint: **コード変更なし（監査のみ）**

## 1) 現象再掲（total_places と top_chains/matrix 合計の差）

### 実測（Playwright経由, production API）
取得先: `https://cryptopaymap.com/api/stats`

- `total_places = 980`
- `total_count = 980`
- `meta.population_id = "places:map_population:v2"`
- `top_chains = [{BTC:5},{ETH:3},{Lightning:1},{TRON:1},{USDC:1},{USDT:1}]`
- `top_chains_sum = 12`
- `asset_acceptance_matrix.rows =`
  - `BTC total=6 (BTC:5, Lightning:1)`
  - `ETH total=3 (ETH:3)`
  - `USDT total=2 (TRON:1, USDT:1)`
  - `USDC total=1 (USDC:1)`
- `matrix_sum = 12`
- 参考: `accepting_any_count = 976`, `top_assets = BTC:977, ETH:3, USDT:2, USDC:1`

> 差分: `total_places (980)` に対して `top_chains_sum/matrix_sum (12)` が極小。

## 2) Map側の「暗号資産OK判定」根拠

結論: **Mapの掲載母集合は「lat/lng がある places」**。暗号資産受け入れの有無で母集合を絞っていない。

- `getMapDisplayableWhereClauses()` は `lat IS NOT NULL` と `lng IS NOT NULL` のみを返す（`lib/stats/mapPopulation.ts` L6-9）。
- `/api/places` DB経路は `where.push(...getMapDisplayableWhereClauses("p"))` を必ず適用（`app/api/places/route.ts` L337）。
- `/api/places` JSON経路も `isMapDisplayablePlace()` で数値lat/lngのみ判定（`app/api/places/route.ts` L839-842, `lib/stats/mapPopulation.ts` L11-17）。

### Map母集合 SQL（実コード抜粋）

```ts
// lib/stats/mapPopulation.ts
export const getMapDisplayableWhereClauses = (alias = "p"): string[] => [
  `${alias}.lat IS NOT NULL`,
  `${alias}.lng IS NOT NULL`,
];

// app/api/places/route.ts
where.push(...getMapDisplayableWhereClauses("p"));
...
FROM places p
${where.length ? `WHERE ${where.join(" AND ")}` : ""}
```

補足: `/api/places` の `accepted` 出力値は `payment_accepts` から正規化し、空なら `fallback.accepted/supported_crypto` を使う（表示ラベル作成）。ただしこれは「掲載可否」ではなく、掲載済み place の受け入れ表示値構築。

## 3) Stats側の Top chains / Matrix の集計根拠

### 共通母集合（filtered_places）

- `/api/stats` の `total_places` は `filtered_places` CTE (`FROM places p` + map表示条件) を `COUNT(*)`（`app/api/stats/route.ts` L338-342, L486-496）。
- CTEは `getMapDisplayableWhereClauses("p")` を内包するため、母集合ID上はMapと同一設計（`app/api/stats/route.ts` L330-342）。

### Top chains

- 集計元: `payment_accepts.pa.chain`（`app/api/stats/route.ts` L581-584）
- 結合: `INNER JOIN filtered_places fp ON fp.id = pa.place_id`（`app/api/stats/route.ts` L583）
- 条件: `NULLIF(BTRIM(pa.chain), '') IS NOT NULL`（`app/api/stats/route.ts` L584）
- 集計: `COUNT(*) GROUP BY pa.chain`

### Asset Acceptance Matrix

- 集計元: `payment_accepts.pa.asset` + `payment_accepts.pa.chain`（`app/api/stats/route.ts` L627-632）
- 結合: `INNER JOIN filtered_places fp ON fp.id = pa.place_id`（`app/api/stats/route.ts` L629）
- 条件: `pa.asset` と `pa.chain` の **両方** が非空（`app/api/stats/route.ts` L630-631）
- 集計: `COUNT(*) GROUP BY asset, chain`

### 参考（同ルート内）

- `accepting_any_count` は `pa.chain OR pa.asset` が非空で `COUNT(DISTINCT pa.place_id)`（`app/api/stats/route.ts` L609-617）。
- 実測で `accepting_any_count=976` かつ `top_chains_sum=12` なので、`asset` は埋まるが `chain` が空の行が多数ある状態。

## 4) 分裂点の断定（最重要）

**断定（1行）:**
`top_chains` と `asset_acceptance_matrix` は `payment_accepts.chain` を必須条件にしており、productionでは chain 非空行が約12件しかないため、`total_places=980` の母集合から事実上 `acceptance_rows≈12` に縮退している。

根拠:
- `total_places` は `filtered_places` 由来（Map表示条件ベース、`app/api/stats/route.ts` L486-496）。
- `top_chains` は `pa.chain IS NOT NULL/NOT ''` 必須（`app/api/stats/route.ts` L581-585）。
- `matrix` は `pa.asset` **AND** `pa.chain` 必須（`app/api/stats/route.ts` L627-632）。
- 実測値: `top_chains_sum=12`, `matrix_sum=12`, だが `accepting_any_count=976`。

### 最小データフロー図

```text
places (map-population, lat/lngあり) ≈ 980
  └─ filtered_places CTE ≈ 980
      ├─ totals -> total_places = 980
      ├─ payment_accepts JOIN + chain非空 -> top_chains ≈ 12
      └─ payment_accepts JOIN + asset&chain非空 -> matrix ≈ 12

(一方)
payment_accepts JOIN + (asset OR chain)非空 -> accepting_any_count ≈ 976
```

## 5) 最短修正方針（実装は次タスク）

### 案A（推奨・最短）
Statsの chain/matrix 集計において、`chain` 欠損時に Map表示で使う正規化ロジック相当（`asset` fallback / Lightning正規化）を適用し、`top_chains` と matrix の chain次元を再構築する。

- 期待効果: 既存データを即時活用し、`≈980`母集合に対する受け入れ内訳を実態に近づける。
- 変更範囲: `/api/stats` SQL（または前処理CTE）中心。

### 案B
`payment_accepts.chain` を全件バックフィル（assetから chainを埋める変換ルールを定義）し、Statsは現行SQLを維持。

- 期待効果: データ品質を恒久改善。
- ただし: ETL/バックフィル運用が必要で、即効性は案Aより劣る。

**最短で直るのは案A。**

## 付録: 実測取得メモ

- Playwrightで production API を取得（curlは未使用）。
- `https://cryptopaymap-v2.vercel.app/api/stats` は `503 stats_unavailable`。
- `https://cryptopaymap.com/api/stats` は `200` で上記値を返却。
