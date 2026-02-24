# Stats v4.0 「完全パリティ監査」報告書

- 監査名: Map母集合（表示可能集合） vs Stats全項目パリティ監査
- 監査日: 2026-02-23
- 方針: **監査のみ（実装変更なし）**
- 判定基準: `OK / Partial / NG`

## PR-1 反映メモ（母集合ズレ解消: Total/4クラス/Countries/Cities/Categories）

- Parity PR-1で、Stats母集合を Map表示可能集合（`lat/lng NOT NULL`）に統一した。
- `total_count` / `verification_breakdown` / `countries` / `cities` / `categories` を同一母集合（`filtered_places`）で算出するよう修正した。
- DB障害時のStats fallbackは `data/places.json` 集計へ寄せ、Map fallbackソースと揃えた。
- 本監査のうち上記5項目のNG原因（母集合ズレ）は解消済み。ランキング/チェーン/マトリクス/Trends等はPR-2以降で継続。

---

## 0. エグゼクティブサマリ

結論: **NG（非準拠）**。

最上位の前提（母集合一致）が成立していない。
主要因は次の3点。

1. Map（/api/places）は `lat/lng NOT NULL` + `bbox` + `limit` 前提でページングされる一方、Stats（/api/stats）は `FROM places` 全体をフィルタ集計し、`lat/lng` を必須にしていない。
2. Map/Stats とも DB→JSON fallback を持つが、判定経路が独立しており、片側だけJSON化しうる。
3. Statsは無フィルタ時に `stats_cache`（total系）と live集計（v4詳細）をマージするため、同一レスポンス内で出所が分かれる。

そのため、Total/4クラス/ranking/chains/matrix の全項目で「Map母集合期待値」との恒常的一致は保証されない。

---

## 1. 母集合の厳密定義（最優先）

### 1-1. Map母集合の定義

#### 1-1-a. Mapが実際に表示する「画面集合」
`MapClient` は都度 `/api/places` を呼び出し、`bbox` と `limit` を必ず付与する。`limit` は zoom 依存（最大 12000）。

- リクエスト: `/api/places?bbox=...&limit=...&...filters`
- 画面集合: Map母集合のうち、**現在の bbox × limit に入ったページ**

#### 1-1-b. Mapの「表示可能母集合（監査基準集合）」
監査上の母集合は、`/api/places` の WHERE 条件（bbox/limit を除いた恒常条件）で定義する。

**Map母集合（DB経路）**
```sql
SELECT p.id
FROM places p
LEFT JOIN verifications v ON v.place_id = p.id -- 存在時
WHERE p.lat IS NOT NULL
  AND p.lng IS NOT NULL
  -- optional filters
  AND (:category IS NULL OR p.category = :category)
  AND (:country  IS NULL OR p.country  = :country)
  AND (:city     IS NULL OR p.city     = :city)
  AND (:q        IS NULL OR p.name ILIKE :q OR COALESCE(p.address,'') ILIKE :q)
  AND (:verification[] IS NULL OR COALESCE(v.level,'unverified') = ANY(:verification[]))
  AND (:accepted[] IS NULL OR EXISTS (
    SELECT 1 FROM payment_accepts pa
    WHERE pa.place_id = p.id
      AND (LOWER(pa.asset) = ANY(:accepted[]) OR LOWER(pa.chain)=ANY(:accepted[]))
  ))
```

**Map母集合（JSON経路）**
- `data/places.json` を同等フィルタで絞り込む。
- `lat/lng` null/NaN は除外。

**観測**
- `published/approved` を必須化する WHERE は Map API 側にない。
- `promoted/source` フィルタ入力は Map API にない。

### 1-2. Stats母集合の定義

Stats API は `filtered_places` CTE を `FROM places p` から作り、filterは country/city/category/accepted/verification/promoted/source の任意入力のみ。

```sql
WITH filtered_places AS (
  SELECT p.id, p.country, p.city, p.category
  FROM places p
  WHERE ...buildFilterSql(filters)
)
```

**観測**
- `lat/lng NOT NULL` 条件は無い。
- `published/approved` 必須条件は無い。
- 無フィルタ時に `stats_cache`（total系）を併用し、同レスポンスで live 集計値（v4項目）をマージする。
- DB不可時は JSON (`lib/data/places`) へ縮退するが、こちらも `lat/lng` 除外なし。

### 1-3. 母集合判定

| 項目 | 判定 | 理由 |
|---|---|---|
| Map母集合(DB) vs Stats母集合(DB) | **NG** | Stats側に `lat/lng` 必須が無い。Map側は必須。 |
| Map母集合(JSON) vs Stats母集合(JSON) | **NG** | Map JSONは `lat/lng null/NaN` 除外、Stats JSONは除外なし。 |
| データソース一致性（同時刻） | **Partial** | 両APIで fallback 判定が独立し、片側のみJSON化しうる。 |
| キャッシュ整合 | **NG** | Map(20s + client cache) と Stats(cache-control + stats_cache) が非対称。 |

原因分類:
- 母集合不一致（WHERE差）
- データソース不一致（DB/JSON）
- キャッシュ鮮度差

---

## 2. Map母集合ベースの期待集計SQL（完全版）

以下は **Map母集合 `M`**（= `lat/lng NOT NULL` と Map filterを満たす places）を前提とした期待値SQL。

### 2-1. Total places
```sql
SELECT COUNT(*) AS total_places
FROM M;
```

### 2-2. 4クラス（owner/community/directory/unverified）
```sql
SELECT COALESCE(verification,'unverified') AS key, COUNT(*) AS total
FROM M
GROUP BY 1;
```

### 2-3. Countries（distinct）+ ranking
```sql
SELECT COUNT(DISTINCT NULLIF(BTRIM(country), '')) AS countries
FROM M;

SELECT NULLIF(BTRIM(country), '') AS key, COUNT(*) AS total
FROM M
WHERE NULLIF(BTRIM(country), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, key ASC;
```

### 2-4. Cities（distinct）+ ranking
```sql
SELECT COUNT(DISTINCT (NULLIF(BTRIM(country), ''), NULLIF(BTRIM(city), ''))) AS cities
FROM M
WHERE NULLIF(BTRIM(country), '') IS NOT NULL
  AND NULLIF(BTRIM(city), '') IS NOT NULL;

SELECT CONCAT(NULLIF(BTRIM(city), ''), ', ', NULLIF(BTRIM(country), '')) AS key,
       COUNT(*) AS total
FROM M
WHERE NULLIF(BTRIM(city), '') IS NOT NULL
  AND NULLIF(BTRIM(country), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, key ASC;
```

### 2-5. Categories（distinct）+ ranking
```sql
SELECT COUNT(DISTINCT NULLIF(BTRIM(category), '')) AS categories
FROM M
WHERE NULLIF(BTRIM(category), '') IS NOT NULL;

SELECT NULLIF(BTRIM(category), '') AS key, COUNT(*) AS total
FROM M
WHERE NULLIF(BTRIM(category), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, key ASC;
```

### 2-6. Chains / Assets（top/ranking/totals）
```sql
-- top_chains
SELECT NULLIF(BTRIM(pa.chain), '') AS key, COUNT(*) AS total
FROM payment_accepts pa
JOIN M ON M.id = pa.place_id
WHERE NULLIF(BTRIM(pa.chain), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, key ASC;

-- top_assets
SELECT NULLIF(BTRIM(pa.asset), '') AS key, COUNT(*) AS total
FROM payment_accepts pa
JOIN M ON M.id = pa.place_id
WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, key ASC;

-- accepting_any_count
SELECT COUNT(DISTINCT pa.place_id) AS accepting_any_count
FROM payment_accepts pa
JOIN M ON M.id = pa.place_id
WHERE NULLIF(BTRIM(COALESCE(pa.asset,'')), '') IS NOT NULL
   OR NULLIF(BTRIM(COALESCE(pa.chain,'')), '') IS NOT NULL;
```

### 2-7. Asset Matrix（v4.0現行定義 = asset × chain）
```sql
SELECT NULLIF(BTRIM(pa.asset), '') AS asset,
       NULLIF(BTRIM(pa.chain), '') AS chain,
       COUNT(*) AS total
FROM payment_accepts pa
JOIN M ON M.id = pa.place_id
WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
  AND NULLIF(BTRIM(pa.chain), '') IS NOT NULL
GROUP BY 1,2
ORDER BY total DESC, asset ASC, chain ASC;
```

---

## 3. Stats API実装との項目別対応と判定

### 3-1. Total places
- Stats返却: `total_places`, `total_count`
- 実装: `responseFromDbFallback` の `COUNT(*) FROM filtered_places` または `stats_cache.total_places`
- 判定: **NG**
- 理由:
  - `filtered_places` に `lat/lng NOT NULL` なし（母集合差）。
  - 無フィルタ時は `stats_cache` と live値混在（鮮度差）。

### 3-2. 4クラス件数
- Stats返却: `verification_breakdown.owner/community/directory/unverified`
- 実装: `fetchDbSnapshotV4` の `LEFT JOIN verifications` 集計
- 判定: **Partial**
- 理由:
  - 集計SQL自体は4クラスに沿うが、母集合がMapと不一致。
  - verification列選択が `level` 優先・なければ `status` を利用し、Map側（places API）は `level` 無い時 unverified寄りの挙動となるため差が出うる。

### 3-3. Countries distinct + ranking
- Stats返却: `countries`, `country_ranking`
- 判定: **NG**
- 理由: 母集合差（lat/lng）により countries/country_ranking とも差が発生。

### 3-4. Cities distinct + ranking
- Stats返却: `cities`, `city_ranking`
- 判定: **NG**
- 理由:
  - 母集合差。
  - city distinct は `(country, city)` 複合キーで実装されており定義は妥当だが、Map母集合に限定されていない。

### 3-5. Categories distinct + ranking
- Stats返却: `categories`, `category_ranking`
- 判定: **NG**
- 理由: 母集合差。

### 3-6. Chains / Assets（Top, ranking, totals）
- Stats返却: `chains`, `top_chains`, `top_assets`, `accepting_any_count`
- 判定: **Partial**
- 理由:
  - DB live（`fetchDbSnapshotV4`）の `top_chains/top_assets/accepting_any_count` は構造上ほぼ期待SQLに一致。
  - ただし fallback (`responseFromDbFallback`) の `chains` は chain優先+asset代替（COALESCE）であり、`top_chains` と定義が異なる。
  - 母集合差の影響を受ける。

### 3-7. Asset Matrix
- Stats返却: `asset_acceptance_matrix`（asset×chain）
- 判定: **Partial**
- 理由:
  - 形式と軸は v4.0 現行定義と一致。
  - ただし `TOP_MATRIX_LIMIT` の上限適用（20×20）で全件行列ではない。
  - 母集合差の影響あり。

### 3-8. promoted / source / verification などフィルタ軸
- Stats: `country/city/category/accepted/verification/promoted/source` を受理
- Map: `category/country/city/chain/payment/verification/q` を利用（promoted/source なし）
- 判定: **NG**
- 理由:
  - フィルタ次元が非対称で、同条件比較不能。
  - verification の列解釈にも差がある。

---

## 4. 0件・縮退・キャッシュ監査

| 観点 | 判定 | 所見 |
|---|---|---|
| 0件耐性 | OK | Stats UIは EMPTY_STATS/empty trends で0描画可能。 |
| DB→JSON縮退 | Partial | 両APIに縮退はあるが、同時に同一ソースになる保証なし。 |
| limited表示 | Partial | Mapはヘッダ判定、Statsはpayloadの`limited`判定で、意味は近いが契約が非対称。 |
| キャッシュ鮮度整合 | NG | Map 20秒キャッシュ＋client cache、Statsはs-maxage+stats_cache。 |

---

## 5. 原因分類（NG/Partialの根本原因）

1. **母集合不一致（WHERE差）**
   - Map: `lat/lng NOT NULL` 必須。
   - Stats: 当該条件なし。
2. **集計定義不一致**
   - fallback `chains` が chain/asset の混在キー。
   - verification列 `level/status` 解釈が Map API とズレる可能性。
3. **データソース不一致**
   - Map/Stats の DB→JSON fallback が独立。
4. **キャッシュ鮮度差**
   - MapとStatsで更新窓が非対称。
5. **UI/入力差**
   - Statsのみ `promoted/source` を持ち、Map比較軸として非対称。

---

## 6. 修正方針（実装しない・方針確定のみ）

### 方針P0（最優先: 母集合統一）
1. Statsの `filtered_places` に Map準拠の恒常条件を追加
   - `p.lat IS NOT NULL AND p.lng IS NOT NULL`
2. 「Map母集合」をAPI契約として明文化
   - bbox/limit は表示スコープ、母集合は別概念として分離定義

### 方針P1（フィルタ軸統一）
1. parity監査対象では `promoted/source` を Map側にも導入するか、Stats側比較対象から分離する
2. verification のソース規約を統一（`level`優先/`status`代替/欠損時unverified）

### 方針P2（集計定義統一）
1. `chains` の意味を固定
   - chainのみ、assetは別フィールドに限定
2. matrix の TopN 制限有無を仕様に明記
   - 全件必要なら上限撤廃またはページング化

### 方針P3（データソース・鮮度整合）
1. Map/Statsで同一リクエスト時の datasource を揃える（監査モードで強制）
2. parity監査時に cache bypass を有効化
3. `stats_cache` と live集計の混在を避け、同一スナップショット時点に固定

---

## 7. 完全判定表（漏れなし）

| 監査項目 | 判定 | 主因 |
|---|---|---|
| 母集合一致 | **NG** | WHERE差（lat/lng）、source/キャッシュ差 |
| Total places | **NG** | 母集合差 + cache混在 |
| 4クラス（owner/community/directory/unverified） | **Partial** | 母集合差 + verification列解釈差 |
| Countries distinct | **NG** | 母集合差 |
| Countries ranking | **NG** | 母集合差 |
| Cities distinct | **NG** | 母集合差 |
| Cities ranking | **NG** | 母集合差 |
| Categories distinct | **NG** | 母集合差 |
| Category ranking | **NG** | 母集合差 |
| Chains totals/ranking | **Partial** | 母集合差 + fallback定義差 |
| Assets totals/ranking | **Partial** | 母集合差 |
| Asset Matrix | **Partial** | 母集合差 + TopN上限制約 |
| promoted/source/verification 軸一致 | **NG** | Map/Stats入力軸非対称 |
| 0件時挙動 | **OK** | フロント・APIともゼロ縮退あり |
| DB/JSON縮退の整合 | **Partial** | 独立fallbackで不一致余地 |
| キャッシュ鮮度整合 | **NG** | TTL/キャッシュ構造が非対称 |

---

## 8. 監査に使った主なコード根拠

- Mapの `/api/places` 呼び出し（bbox/limit付与）
  - `components/map/MapClient.tsx`:
    - limit算出: `getLimitForZoom`
    - fetch: `/api/places?...`
- places API（DB/JSON、lat/lng条件、fallback、cache）
  - `app/api/places/route.ts`
- filters生成（Mapクエリ軸）
  - `lib/filters.ts`
- data source契約（DB/JSON・limited header）
  - `lib/dataSource.ts`, `lib/clientDataSource.ts`
- stats API（filtered_places、v4項目、cache、fallback）
  - `app/api/stats/route.ts`
- stats UI（利用フィールド、filters、limited表示）
  - `app/(site)/stats/StatsPageClient.tsx`
- v4.0仕様
  - `docs/stats-v4.0.md`
