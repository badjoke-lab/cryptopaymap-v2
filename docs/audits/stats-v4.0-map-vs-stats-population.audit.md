# 監査: Map母集合 vs Stats母集合（stats-v4.0 / population_id=places:map_visible:v1）

## 0. 監査範囲と実行ログ

実行コマンド:
- `rg -n "population_id|map_visible|places" app lib components`
- `rg -n "bbox|limit|lat|lng" app lib components`
- `node - <<'NODE' ... pg接続テスト ... NODE`

DB実行可否:
- `psql` は環境に存在せず実行不可（`bash: command not found: psql`）。
- `pg` での接続も `ECONNREFUSED (127.0.0.1:5432 / ::1:5432)` で失敗。
- よって **本レポートでは差分SQLを完全提示**し、DB結果の貼付は不可（環境制約）とする。

---

## 1) Map側「表示可能な全件母集合」の定義（コード上の確定）

### 1-1. 母集合の共通述語（単一ソース）

`lib/stats/mapPopulation.ts`:
- `getMapDisplayableWhereClauses()` は **`lat IS NOT NULL` と `lng IS NOT NULL` のみ**を返す。
- `isMapDisplayablePlace()` も JSON系では `lat/lng` が finite number であることのみ判定。

**SQL相当（Map表示可能母集合）**
```sql
SELECT p.id
FROM places p
WHERE p.lat IS NOT NULL
  AND p.lng IS NOT NULL;
```

### 1-2. Map APIで母集合が使われる箇所

`app/api/places/route.ts` のDB経路 `loadPlacesFromDb()` で、`where.push(...getMapDisplayableWhereClauses("p"))` を必ず追加。
したがって Map API のベース母集合は上記（lat/lng not null）。

ただし `/api/places` の実レスポンスはこの母集合に対して追加で:
- `bbox`（指定時）
- `category/country/city/q/verification/payment`（指定時）
- `LIMIT/OFFSET`（常時。既定 `limit=1200`）
がかかる。

**重要**: UI側 `components/map/MapClient.tsx` は毎回 `bbox` と `zoom由来limit` を付けて `/api/places` を呼ぶ。つまり画面表示データは「母集合そのもの」ではなく **ビュー（bbox + limit の部分集合）**。

---

## 2) Stats側 `/api/stats` の母集合定義（population_id=places:map_visible:v1）

`app/api/stats/route.ts`:
- レスポンス `meta.population_id` は `places:map_visible:v1`。
- `buildFilteredPlacesCte()` で `baseClause = getMapDisplayableWhereClauses("p")` を採用し、`filtered_places` CTEの `WHERE` に合成。

フィルタ未指定時（比較対象の素の母集合）は、最終的に:

```sql
WITH filtered_places AS (
  SELECT p.id, p.country, p.city, p.category
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
)
SELECT COUNT(*)
FROM filtered_places;
```

したがって Stats母集合のベース定義も **lat/lng not null のみ**。

---

## 3) Map母集合(A) と Stats母集合(B) の差分SQL（再現用）

本監査での比較定義:
- A = Map表示可能な全件母集合（`getMapDisplayableWhereClauses` のみ）
- B = Stats母集合（`population_id=places:map_visible:v1` のベース）

### 3-1. A\B / B\A 件数

```sql
WITH
A AS (
  SELECT p.id
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
),
B AS (
  SELECT p.id
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
),
A_minus_B AS (
  SELECT id FROM A
  EXCEPT
  SELECT id FROM B
),
B_minus_A AS (
  SELECT id FROM B
  EXCEPT
  SELECT id FROM A
)
SELECT
  (SELECT COUNT(*) FROM A) AS a_count,
  (SELECT COUNT(*) FROM B) AS b_count,
  (SELECT COUNT(*) FROM A_minus_B) AS a_minus_b_count,
  (SELECT COUNT(*) FROM B_minus_A) AS b_minus_a_count;
```

### 3-2. 差分原因カテゴリ集計

```sql
WITH
A AS (
  SELECT p.id, p.lat, p.lng, p.stage, p.deleted_at, p.hidden_at, p.source
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
),
B AS (
  SELECT p.id, p.lat, p.lng, p.stage, p.deleted_at, p.hidden_at, p.source
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
),
D AS (
  SELECT 'A\\B' AS side, a.*
  FROM A a
  LEFT JOIN B b USING (id)
  WHERE b.id IS NULL
  UNION ALL
  SELECT 'B\\A' AS side, b.*
  FROM B b
  LEFT JOIN A a USING (id)
  WHERE a.id IS NULL
)
SELECT
  side,
  CASE
    WHEN lat IS NULL OR lng IS NULL THEN 'lat_lng_null'
    WHEN stage IS NOT NULL THEN 'stage=' || stage::text
    WHEN deleted_at IS NOT NULL THEN 'deleted_at_not_null'
    WHEN hidden_at IS NOT NULL THEN 'hidden_at_not_null'
    WHEN NULLIF(BTRIM(COALESCE(source::text, '')), '') IS NOT NULL THEN 'source=' || source::text
    ELSE 'other'
  END AS reason,
  COUNT(*) AS cnt
FROM D
GROUP BY side, reason
ORDER BY side, cnt DESC, reason;
```

### 3-3. 差分カテゴリごとのplace idサンプル（各10件）

```sql
WITH
A AS (
  SELECT p.id, p.lat, p.lng, p.stage, p.deleted_at, p.hidden_at, p.source
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
),
B AS (
  SELECT p.id, p.lat, p.lng, p.stage, p.deleted_at, p.hidden_at, p.source
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
),
D AS (
  SELECT 'A\\B' AS side, a.*
  FROM A a
  LEFT JOIN B b USING (id)
  WHERE b.id IS NULL
  UNION ALL
  SELECT 'B\\A' AS side, b.*
  FROM B b
  LEFT JOIN A a USING (id)
  WHERE a.id IS NULL
),
L AS (
  SELECT
    side,
    CASE
      WHEN lat IS NULL OR lng IS NULL THEN 'lat_lng_null'
      WHEN stage IS NOT NULL THEN 'stage=' || stage::text
      WHEN deleted_at IS NOT NULL THEN 'deleted_at_not_null'
      WHEN hidden_at IS NOT NULL THEN 'hidden_at_not_null'
      WHEN NULLIF(BTRIM(COALESCE(source::text, '')), '') IS NOT NULL THEN 'source=' || source::text
      ELSE 'other'
    END AS reason,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY side,
      CASE
        WHEN lat IS NULL OR lng IS NULL THEN 'lat_lng_null'
        WHEN stage IS NOT NULL THEN 'stage=' || stage::text
        WHEN deleted_at IS NOT NULL THEN 'deleted_at_not_null'
        WHEN hidden_at IS NOT NULL THEN 'hidden_at_not_null'
        WHEN NULLIF(BTRIM(COALESCE(source::text, '')), '') IS NOT NULL THEN 'source=' || source::text
        ELSE 'other'
      END
      ORDER BY id
    ) AS rn
  FROM D
)
SELECT side, reason, id
FROM L
WHERE rn <= 10
ORDER BY side, reason, id;
```

---

## 4) 「limit/bbox誤解ではない」ことの明示

コード事実:
- Map UIは `bbox` + `limit` を毎回付けて `/api/places` を取得する（画面内+上限件数）。
- `/api/places` も `limit` を常時適用（既定1200、最大5000、`mode=all`でも上限1200）。
- Stats母集合は `filtered_places` CTE（`lat/lng not null`）を全体集計し、Map UIのbbox/limitとは独立。

結論（コード監査に基づく断定）:
- **母集合定義そのもの（Map表示可能全件 vs Stats population_id）は一致**している。
- 見かけの件数差が発生する主因は、Map画面データが仕様上 `bbox + limit` の部分集合である点。

---

## 5) 修正方針（根拠付き・1段落）

修正対象は母集合定義ではなく、比較対象の取り方である。Mapの「画面内取得件数」をStatsの「全体母集合件数」と直接比較しない運用に揃えるべきで、必要なら Map 側に「全件母集合カウント専用API（`lat/lng not null` を同一述語でCOUNT）」を追加し、UI表示上も `in_view_count` と `population_total` を分離して明示するのが整合的である（根拠: 両者が同じ `getMapDisplayableWhereClauses` を参照している一方、Map実表示は `bbox/limit` を常時付与）。
