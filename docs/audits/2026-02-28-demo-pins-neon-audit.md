# PR-XX 調査レポート: Demo pins audit (Neon DB) + exclusion design for Stats/Discover

- 日付: 2026-02-28
- 対象: `public.places` / Stats (`/api/stats`) / Discover (`/api/discover/*`)
- 目的: **Map表示は維持しつつ、Stats/Discover/Topヘッドライナーからデモ4件を恒久的に除外する設計を確定**
- 注意: 本レポートは**調査のみ**。実装・マージは未実施。

---

## 0. 実行コンテキストと制約（事実）

このコンテナでは Neon へ直接接続して SQL 実行するための `DATABASE_URL` が設定されておらず、さらに外部公開 API（`https://cryptopaymap.com`）への接続も拒否されました。

### 実行結果（そのまま）

```bash
$ node --import tsx scripts/db-check.mjs -- antarctica-owner-1
DATABASE_URL is not set. Add it to .env.local or export it before running this script.
```

```bash
$ curl -sS https://cryptopaymap.com/api/places?country=AQ | jq 'length'
curl: (56) CONNECT tunnel failed, response 403
```

したがって、本書の「Neon現状」は以下の2層で示します。

1. **コード上で確定できる混入経路・where 条件（確定）**
2. **Neon 実測 SQL（未実行。再実行用SQLを明示）**

> 推測は避け、確認不能な箇所は「未確認」と明記。

---

## 1. 現状

### 1-1. `public.places` スキーマ

#### 1-1-a. Neon 実測（未確認）

現環境では DB 接続不可のため、`information_schema.columns` からの**実測結果は取得不可**。

#### 1-1-b. 実測用SQL（そのまま実行可能）

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'places'
ORDER BY ordinal_position;
```

`is_demo` 等の識別カラム確認用:

```sql
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'places'
    AND column_name = 'is_demo'
) AS has_is_demo;
```

#### 1-1-c. コード観点の事実（補助情報）

- 現行 API 実装は `places` から `country/city/category/promoted/source` などの存在を動的に検査して利用するが、`is_demo` は参照していない。
- Map 表示可能条件は `lat IS NOT NULL` かつ `lng IS NOT NULL` のみ（デモ除外条件なし）。

---

### 1-2. デモ4件の特定

#### 1-2-a. Neon 実測（未確認）

要件どおり AQ を入口にした DB 抽出の**実行結果は未取得**（接続不可）。

#### 1-2-b. 実測用SQL（AQは特定の入口としてのみ使用）

```sql
SELECT id, name, country, lat, lng
FROM public.places
WHERE country = 'AQ'
ORDER BY id;
```

verification class 取得（`verifications.level` を優先）:

```sql
SELECT
  p.id,
  p.name,
  p.country,
  p.lat,
  p.lng,
  COALESCE(v.level, v.status, 'unverified') AS verification,
  p.source
FROM public.places p
LEFT JOIN LATERAL (
  SELECT level, status
  FROM public.verifications v
  WHERE v.place_id = p.id
  ORDER BY CASE COALESCE(v.level, v.status, 'unverified')
    WHEN 'owner' THEN 1
    WHEN 'community' THEN 2
    WHEN 'directory' THEN 3
    ELSE 4
  END
  LIMIT 1
) v ON TRUE
WHERE p.country = 'AQ'
ORDER BY p.id;
```

#### 1-2-c. リポジトリ内で確認できる「デモ4ID + verification」

運用/スモーク手順に下記4件が明示されている（Neon 実測ではなく、コード/ドキュメント事実）。

- `antarctica-owner-1` → `owner`
- `antarctica-community-1` → `community`
- `antarctica-directory-1` → `directory`
- `antarctica-unverified-1` → `unverified`

---

### 1-3. Stats/Discover 混入の実態（コード確定）

- Stats の母集合は `places` を `lat/lng NOT NULL` で絞るのみ。`is_demo` や AQ 除外は無い。
- Discover 各集計も同様に `places` への結合時に `lat/lng NOT NULL` を主条件としており、デモ識別での除外は無い。
- よって、Map表示可能なデータ（=デモ4件を含む）は Stats/Discover 側集計に自然混入する。

---

## 2. 混入経路

### 2-1. Stats 経路と理由

#### 経路

`app/api/stats/route.ts` → `fetchDbSnapshotV4()` → `buildFilteredPlacesCte()`

#### 条件抜粋

- `buildFilteredPlacesCte` はベース条件に `getMapDisplayableWhereClauses("p")` を使用
- `getMapDisplayableWhereClauses` は以下のみ

```ts
p.lat IS NOT NULL
p.lng IS NOT NULL
```

- 追加フィルタ（country/city/category/source/verification/accepted/promoted）は URL パラメータ依存で、デフォルトではデモ除外にならない

#### 混入理由

Stats は「Map表示可能母集合」をそのまま集計しているため、**Mapに出すためのデモピンがそのまま Stats 指標へ入る**。

---

### 2-2. Discover 経路と理由

#### 代表経路

- Activity: `queryActivity()`
- Featured Cities: `queryFeaturedCities()`
- Assets: `queryAssets()`
- Asset Panel: `queryAssetPanel()`
- Trending Countries: `queryTrendingCountries()`（history→places join）

#### 条件抜粋（共通傾向）

多くのクエリで `places p` への join 後に以下条件を使用:

```sql
WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
```

他に `country/city/category` の非空条件はあるが、**demo識別条件は無い**。

#### 混入理由

Discover も「Map表示可能な places」を基準に各種集計/ランキングを計算しており、デモ4件を識別して排除するロジックが存在しないため混入する。

---

## 3. 修正案比較（A/B/C）

### 案A（推奨・恒久）

`public.places` に明示フラグ追加:

```sql
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
```

運用:

- デモ4件だけ `is_demo = true`
- Stats/Discover/Topヘッドライナー系クエリで `WHERE COALESCE(p.is_demo, false) = false`
- Map系（`/api/places`）は除外しない

メリット:

- location非依存
- デモ増減に追随しやすい
- 仕様説明（「デモデータ」）とデータモデルが一致

---

### 案B（暫定・非推奨）

Stats/Discover で `country='AQ'` を除外。

デメリット:

- location依存
- 将来 AQ 実データが入ると破綻
- 「デモ概念」を地理コードに誤投影

---

### 案C（既存列流用）

`source/provider` 等で demo識別する案。

評価:

- 現行コード上は `source` がフィルタ項目として存在するのみで、demo専用値を保証する仕様/制約がない
- `provider` は places APIの主要参照列として確認できず、互換実装でも未保証
- **識別列としての一意性・永続性が保証できないため恒久案としては不採用**

---

## 4. 推奨案（確定）

**案A（`is_demo` 明示フラグ）を採用**

### 4-1. 変更対象ファイル（実装時）

- `app/api/stats/route.ts`
- `lib/discover/server.ts`
- （必要に応じて）Topヘッドライナーを構築する Discover story 集計SQL
- `migrations/*`（DDL追加）

### 4-2. 変更する where 条件（実装時）

- Stats: `buildFilteredPlacesCte` の母集合条件へ
  - `AND COALESCE(p.is_demo, false) = false`
- Discover: `places p` を起点/結合する各クエリへ
  - `AND COALESCE(p.is_demo, false) = false`

### 4-3. 追加 DDL（案A）

```sql
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- デモ4件のマーキング
UPDATE public.places
SET is_demo = true
WHERE id IN (
  'antarctica-owner-1',
  'antarctica-community-1',
  'antarctica-directory-1',
  'antarctica-unverified-1'
);
```

---

## 5. DoD（受け入れ条件）

1. Mapにデモ4ピンが引き続き表示される
2. Stats/Discover/Topヘッドライナーにデモ4件が含まれない
3. Stats `total_places` が `is_demo=false` 件数と一致する

検証SQL（実装後）:

```sql
-- 母集合（Map表示可能かつ非デモ）
SELECT COUNT(*)::int AS expected_stats_total
FROM public.places p
WHERE p.lat IS NOT NULL
  AND p.lng IS NOT NULL
  AND COALESCE(p.is_demo, false) = false;
```

```sql
-- デモ件数確認
SELECT COUNT(*)::int AS demo_count
FROM public.places
WHERE COALESCE(is_demo, false) = true;
```

---

## 付録: 今回の結論

- **AQ除外は恒久対応として不採用**。
- **恒久対応は location ベースではなく、`is_demo` 明示フラグで設計するべき**。
- 本コンテナでは Neon 実測SQLを実行できなかったため、上記 SQL を Neon 接続可能環境で実行して結果を確定させること。
