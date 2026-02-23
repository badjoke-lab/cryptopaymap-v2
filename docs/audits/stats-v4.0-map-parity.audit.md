# Stats v4.0 Map Parity Audit Report

- 監査名: Map表示母集合 vs Stats集計母集合 一致監査
- 監査日: 2026-02-23
- 対象: `components/map/*`, `app/api/places*`, `app/api/stats*`, `lib/stats/*`, `lib/history.ts`, `lib/dataSource.ts`
- 実施方針: **監査のみ**（コード変更なし）

## 結論

## **NOT COMPLIANT**

現行実装は「Mapに出ているもの＝Stats母集合」という要件を満たしていません。主因は、MapとStatsで**母集合の定義軸そのものが一致していない**ことです（bbox/lat-lng条件/履歴起点/キャッシュ起点/データソース縮退差）。

---

## 1. Map母集合の定義（コード根拠つき）

### 1-1. Mapクライアントが実際に数える集合
- Mapは表示更新時に `/api/places` を呼び、`bbox` と `limit` を必ず付与します（zoomでlimit可変、最大12000）。
- クライアント内部でも `bbox@zoom|filter` をキーに結果をキャッシュします。
- limited mode はレスポンスヘッダから判定して UI 通知を表示します。

**根拠**
- `fetch('/api/places?...')` と `bbox/limit` 付与: `components/map/MapClient.tsx` L523-577
- zoom→limit 設定（2000/4000/8000/12000）: `components/map/MapClient.tsx` L460-464
- クライアントキャッシュ（requestKey）: `components/map/MapClient.tsx` L520-546, L594-600
- limited 判定と通知: `components/map/MapClient.tsx` L577, L1156

### 1-2. /api/places（DB経路）の母集合
DB経路で Map が受け取る集合は概ね以下:

`places p` から、
- `lat/lng IS NOT NULL` 必須
- bbox 必須（Mapが必ず付ける）
- optional: category/country/city/search/verification/payment
- **approve/promote/published の必須WHEREは存在しない**
- order + `LIMIT/OFFSET`

**根拠**
- `where.push("p.lat IS NOT NULL")`, `where.push("p.lng IS NOT NULL")`: `app/api/places/route.ts` L336-337
- bbox 条件: `app/api/places/route.ts` L387-407
- verification/payment/search 条件: `app/api/places/route.ts` L409-422, L425-440
- 最終 SQL（`FROM places`, `LIMIT/OFFSET`）: `app/api/places/route.ts` L452-457
- 承認状態（approve/promote/published）条件不在: 同上 L320-457

### 1-3. /api/places（fallback JSON経路）の母集合
- DB不達時、`shouldAllowJson` なら `data/places.json` を同様に絞り込んで返却。
- このとき `x-cpm-data-source=json` + `x-cpm-limited=1`。

**根拠**
- DB/JSON 切替と fallback: `app/api/places/route.ts` L755-831
- JSONフィルタ（lat/lng, bbox, 各種 filter）: `app/api/places/route.ts` L838-888
- JSON limited 返却: `app/api/places/route.ts` L895-904

### 1-4. 「Mapに出る=承認済み」担保の有無
- **担保なし**。`/api/places` には approve/promote/published を必須とする条件がありません。
- よって現実装での Map 表示は「承認済み集合」ではなく「`places` に存在し表示条件を満たす集合」です。

---

## 2. Stats母集合の定義（コード根拠つき）

### 2-1. /api/stats（DB経路）
- 基本母集合は `WITH filtered_places AS (SELECT ... FROM places p ${whereClause})`。
- `whereClause` は country/city/category/promoted/source/verification/accepted の任意フィルタのみ。
- **lat/lng 必須条件なし**。
- **approve/promote/published の必須条件なし**（promoted はクエリフィルタ指定時のみ）。

**根拠**
- フィルタSQL構築: `app/api/stats/route.ts` L340-378
- 母集合CTE起点 `FROM places p`: `app/api/stats/route.ts` L434-438
- lat/lng 条件不在: `app/api/stats/route.ts` L340-378

### 2-2. /api/stats の fallback / limited mode
- DB不可で `shouldAllowJson=true` のとき `responseFromPlaces(places JSON)` を返却。
- `responseFromPlaces` は `limitedResponse({...})` を使うため `limited: true` で返る。
- `DATA_SOURCE=db` 固定でDB不可なら 503 + limited 空応答。

**根拠**
- fallback分岐: `app/api/stats/route.ts` L782-818
- limited ベース応答: `app/api/stats/route.ts` L160-177
- JSON fallback実装: `app/api/stats/route.ts` L201-218, L284-315

### 2-3. /api/stats の cache 由来値
- 無フィルタ時 `stats_cache` があれば `total_places/countries/cities/...` を cache から返す。
- ただし同時に `fetchDbSnapshotV4` の値で一部上書きされるため、total系とランキング系で出所が分離する可能性あり。

**根拠**
- `stats_cache` 参照: `app/api/stats/route.ts` L748-767
- cache由来 total: `app/api/stats/route.ts` L179-199

### 2-4. /api/stats/trends の母集合
- trends は `history` テーブルの `action in ('approve','promote')` から place 初出を作る履歴起点。
- これは Map/`/api/stats` の「現時点 places 集合」と別定義。
- DB不可時は empty series（meta reason付き）を返す。

**根拠**
- 履歴アクション定義: `app/api/stats/trends/route.ts` L40
- first_published算出SQL: `app/api/stats/trends/route.ts` L256-262
- DB不可時 empty: `app/api/stats/trends/route.ts` L164-175

---

## 3. Map母集合 vs Stats母集合 差分表（漏れなく列挙）

| 差分種別 | 内容 | 影響 | 優先度 |
|---|---|---|---|
| 取得スコープ差 | Map は bbox + limit のページング結果、Stats total は bbox/limit 非対応の全体集計。 | 同一時刻でも `Map件数 != Stats total` が構造的に発生。 | **致命** |
| 必須条件差 | Map は `lat/lng NOT NULL` 必須、Stats は必須でない。 | 座標欠損レコードが Stats のみ計上され得る。 | **致命** |
| データソース差 | Map と Stats は個別に DB→JSON fallback。片側のみJSON化しうる。 | Map/Stats の母集合が別データセット化。 | **高** |
| limited/fallback 差 | Mapは limited notice をヘッダで表示。Statsも limited 応答だが JSON fallback時は数値を返し、db固定時は空0。 | 運用状態で表示整合が崩れやすい。 | **高** |
| キャッシュ差 | Map: `/api/places` 20s + client cache。Stats: `stats_cache` + API cache-control。 | 鮮度差で件数不一致が継続。 | **高** |
| verification列解釈差 | Map(/places) は `verifications.level` が無いと実質 unverified扱い。Stats は `level` 無ければ `status` をverification列として使用。 | verification filter/内訳で不一致。 | **中** |
| trends母集合差 | trends は history(approve/promote) 起点で places現況集合と別。 | 「Map母集合とStats(trends)一致」要件には不適合。 | **高** |
| 重複計上リスク | `verifications` 1:N の場合、JOINの仕方次第で集計やリストの重複余地。 | まれだが同条件でもズレる候補。 | **中** |

---

## 4. 仕様逸脱 / 設計ミスとして明記すべき点

1. **Map母集合とStats total母集合のスコープ不一致（bbox/limit 非対称）**
   - 要件「Mapに出るもの=Stats母集合」に対し、現状はAPI契約段階で非対称。
2. **Mapのみ lat/lng 必須という暗黙フィルタ差**
   - 母集合の定義が一致していない。
3. **trends の履歴母集合は snapshot/map と別宇宙**
   - 同一“total”語彙でも母集合定義が異なる。
4. **stats_cache と live集計の混在**
   - total系と内訳系の更新タイミングが分離し、観測上の整合性を壊しうる。

---

## 5. 再現可能な検証手順（スマホでも可能な形）

> 実装修正はせず、運用確認用の手順のみ記載。

### 手順A（API比較・推奨）
1. Mapで使う同一条件（country/city/category/payment/verification/q + bbox + limit）を固定。
2. `GET /api/places?...` を叩いて件数取得（JSON配列length）。
3. 同条件で `GET /api/stats?...` を叩き `total_places` を取得。
4. それぞれのレスポンスヘッダ `x-cpm-data-source`, `x-cpm-limited` を取得。
5. 判定:
   - ヘッダが同一でない場合 → fallback起因差分。
   - ヘッダ同一でも差分がある場合 → WHERE差分（bbox/latlng/verification解釈/キャッシュ）を疑う。

### 手順B（DB検証）
1. Map SQL 相当 (`lat/lng NOT NULL` + bbox + フィルタ + limit/offset) で `COUNT(*)`。
2. Stats SQL 相当 (`FROM places p + buildFilterSql`) で `COUNT(*)`。
3. 差分を `lat/lng is null` 件数・bbox外件数で説明できるか確認。

### 手順C（Trends整合の切り分け）
1. `history` で `action in ('approve','promote')` distinct place_id を算出。
2. `places` 現況件数と比較。
3. 差があれば trends と map/snapshot の母集合差として確定。

---

## 6. 原因別の修正方針（提案のみ・この監査では未実装）

- 原因A: スコープ差（bbox/limit）
  - 方針: Stats 側に「Map同等スコープ」を明示入力できる契約（bbox含む）を追加する、または比較対象を global母集合へ統一する。
- 原因B: lat/lng 条件差
  - 方針: Stats total の母集合に `lat/lng` 条件を合わせる、または Map側条件を緩める（どちらかに統一）。
- 原因C: fallback差
  - 方針: Map/Stats で同一リクエスト単位に datasource を固定して共有、または mismatch時は比較不能として明示。
- 原因D: cache鮮度差
  - 方針: parity監査モードでは cache bypass を可能にする。
- 原因E: trends母集合差
  - 方針: trends を「history起点メトリクス」と明示分離し、Map parity対象から除外するか別指標名へ変更。
- 原因F: verification解釈差
  - 方針: `level/status` の優先規約を Map/Stats で統一する。

