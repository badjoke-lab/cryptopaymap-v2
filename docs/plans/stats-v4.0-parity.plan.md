# 【CODEX TASK-D】Stats v4.0 パリティ修正計画（PR分割・実装禁止）

- 入力監査: `docs/audits/stats-v4.0-parity.audit.md`
- 目的: **Stats の全項目を Map 母集合の集計と一致させる**ための実装計画を、PR 分割で確定する。
- 制約: 本書は計画のみ。**実装は行わない**。

---

## 0. 前提（監査CのNG/Partialを全回収する）

本計画では、監査で `NG/Partial` だった以下を漏れなく PR に割り当てる。

- 母集合一致（NG）
- Total places（NG）
- 4クラス内訳（Partial）
- 国/都市/カテゴリ distinct + ranking（NG）
- Chains/Assets/Matrix（Partial）
- promoted/source/verification 軸の非対称（NG）
- DB/JSON 縮退整合（Partial）
- キャッシュ鮮度整合（NG）

---

## 1. 最優先実施順（固定）

1. **母集合統一**
2. **4クラス内訳**
3. **distinct（国/都市/カテゴリ）**
4. **ランキング（国/都市/カテゴリ）**
5. **チェーン/マトリクス**
6. **UI表示**
7. **監査更新（FULL COMPLIANCE）**

この順序を PR 依存に反映する。

---

## 2. PR分割

## PR-1: 母集合統一（Map 準拠 WHERE の単一化）

- 目的（何を一致させるか）:
  - `total_places` を含む全集計の土台となる母集合を Map と Stats で一致させる。
  - DB/JSON の両経路で `lat/lng` 条件差を解消する。

- 変更対象ファイル（具体名）:
  - `app/api/stats/route.ts`
  - `app/api/places/route.ts`
  - `lib/filters.ts`
  - `lib/dataSource.ts`
  - `lib/data/places.ts`

- 変更する SQL / WHERE 条件（Map 母集合へ揃える）:
  - Stats 側 `filtered_places`（および同等 CTE）に Map 準拠条件を導入:
    - `p.lat IS NOT NULL AND p.lng IS NOT NULL`
    - `category/country/city/q/verification/accepted` の条件式を Map 側生成と同一仕様に統一。
  - `promoted/source` は「Map 比較対象外軸」として、parity 計算の母集合には非適用（後方互換のため入力は保持）。

- API レスポンス追加/変更（破壊的変更禁止）:
  - 追加:
    - `meta.parity_basis: "map_population"`
    - `meta.data_source: "db" | "json"`
    - `meta.limited: boolean`
  - 既存フィールドは削除・型変更しない（後方互換維持）。

- キャッシュ/縮退（limited/fallback）方針:
  - Map/Stats で同一リクエスト時に **同一 data source を保証**する共通判定関数を適用。
  - 同一保証できない場合は parity 判定を `meta` で不可として明示し、以降 PR で UI 表示制御。

- 検証方法（“一致した” を確認）:
  1. 同一 filter で `/api/places` と `/api/stats` を実行。
  2. `meta.parity_basis=map_population` かつ `meta.data_source` が一致することを確認。
  3. `total_places` が Map 母集合 COUNT と一致することを確認。


## PR-2: 4クラス内訳の定義統一（owner/community/directory/unverified）

- 目的:
  - verification 解釈差（`level/status`）を解消し、4クラス件数を Map 母集合基準で一致させる。

- 変更対象ファイル:
  - `app/api/stats/route.ts`
  - `app/api/places/route.ts`
  - `lib/data/places.ts`
  - `lib/types/stats.ts`

- 変更する SQL / WHERE 条件:
  - 4クラス集計を Map 母集合 CTE `M` ベースに固定:
    - `COALESCE(verification,'unverified')` で class key を確定。
  - verification 列の正規化規約を API 内共通関数へ統一:
    - `level` 優先、代替 `status`、欠損時 `unverified`。

- API レスポンス追加/変更（非破壊）:
  - 追加:
    - `meta.verification_rule: "level_then_status_else_unverified"`
  - 既存 `verification_breakdown` はキーを維持。

- キャッシュ/縮退方針:
  - `stats_cache` の total 系値と live 集計の混在を禁止（同一レスポンス内の出所統一）。

- 検証方法:
  1. Map 母集合抽出 SQL で期待値（4クラス）を算出。
  2. `/api/stats` `verification_breakdown` と完全一致を確認。
  3. DB 経路 / JSON 経路の双方で一致確認。


## PR-3: distinct（国/都市/カテゴリ）の一致

- 目的:
  - `countries/cities/categories`（distinct 値）を Map 母集合定義で一致させる。

- 変更対象ファイル:
  - `app/api/stats/route.ts`
  - `lib/stats/dashboard.ts`
  - `lib/types/stats.ts`

- 変更する SQL / WHERE 条件:
  - すべて `M`（Map 母集合）から集計。
  - `country/category` は `NULLIF(BTRIM(x),'')` を採用。
  - `cities` は `(country, city)` 複合 distinct を維持しつつ `NULL/空白` 除外を統一。

- API レスポンス追加/変更（非破壊）:
  - 追加:
    - `meta.distinct_rule: "trim_empty_as_null"`
  - 既存 distinct 項目のキー名は維持。

- キャッシュ/縮退方針:
  - distinct 値は total と同一スナップショットから算出（別ソース混在禁止）。

- 検証方法:
  1. 期待 SQL（監査書 2-3/2-4/2-5）で distinct 値を採取。
  2. `/api/stats` の `countries/cities/categories` と一致確認。


## PR-4: ランキング（国/都市/カテゴリ）の一致

- 目的:
  - `country_ranking/city_ranking/category_ranking` を Map 母集合で一致させる。

- 変更対象ファイル:
  - `app/api/stats/route.ts`
  - `lib/stats/dashboard.ts`
  - `lib/types/stats.ts`

- 変更する SQL / WHERE 条件:
  - 集計元を `M` に固定。
  - ソート規則を監査期待値に固定:
    - `ORDER BY total DESC, key ASC`
  - key 正規化（trim/空文字除外）を distinct と同一規約に統一。

- API レスポンス追加/変更（非破壊）:
  - 追加:
    - `meta.ranking_rule: "total_desc_key_asc"`

- キャッシュ/縮退方針:
  - ranking も total/distinct と同一データソース・同一生成時刻に揃える。

- 検証方法:
  1. 期待 SQL で上位 N を取得。
  2. `/api/stats` ranking 配列の key/total/順序が一致することを確認。


## PR-5: チェーン/アセット/マトリクス一致（定義差解消）

- 目的:
  - `top_chains/top_assets/accepting_any_count/asset_acceptance_matrix` を Map 母集合で一致させる。
  - fallback 時 `chains` の COALESCE 定義差（chain優先+asset代替）を解消。

- 変更対象ファイル:
  - `app/api/stats/route.ts`
  - `lib/stats/dashboard.ts`
  - `lib/stats/utils.ts`
  - `lib/data/places.ts`

- 変更する SQL / WHERE 条件:
  - `payment_accepts pa JOIN M ON M.id = pa.place_id` に統一。
  - `top_chains`: `NULLIF(BTRIM(pa.chain),'')` のみ対象。
  - `top_assets`: `NULLIF(BTRIM(pa.asset),'')` のみ対象。
  - `accepting_any_count`: asset/chain のどちらか非空で place 単位 distinct。
  - matrix: `asset × chain` 両方非空。
  - `TOP_MATRIX_LIMIT` は仕様として維持 or 拡張可否を明記し、少なくとも「limit適用後の定義」を API メタに明示。

- API レスポンス追加/変更（非破壊）:
  - 追加:
    - `meta.matrix_limited: boolean`
    - `meta.matrix_limit: number`
    - `meta.chains_rule: "chain_only"`
  - 既存フィールド名は維持。

- キャッシュ/縮退方針:
  - chain/asset/matrix も同一 snapshot 由来に固定。

- 検証方法:
  1. 監査書 2-6/2-7 の期待 SQL で値を算出。
  2. `/api/stats` の chain/asset/matrix 系項目と一致確認。


## PR-6: UI表示整合 + 監査更新（FULL COMPLIANCE クローズ）

- 目的:
  - UI が parity メタを正しく表示し、不一致時に誤解を生まない表示へ統一。
  - 監査結果を FULL COMPLIANCE に更新。

- 変更対象ファイル:
  - `app/(site)/stats/StatsPageClient.tsx`
  - `lib/clientDataSource.ts`
  - `docs/audits/stats-v4.0-parity.audit.md`
  - `docs/stats-v4.0-map-parity.checklist.md`

- 変更する SQL / WHERE 条件:
  - なし（表示と監査更新が中心）。

- API レスポンス追加/変更（非破壊）:
  - 既存 PR で追加した `meta.*` を UI 利用開始。
  - 既存数値フィールドは後方互換維持。

- キャッシュ/縮退方針:
  - `limited/fallback/source mismatch` を UI 上で明示。
  - parity 不可時は「一致判定対象外」として扱い、値の断定表示を避ける。

- 検証方法:
  1. UI 上で `data_source/limited/parity_basis` 表示確認。
  2. チェックリスト全項目を実行し、全 OK を確認。
  3. 監査文書を `FULL COMPLIANCE` に更新。

---

## 3. 完了条件（Definition of Done）

以下をすべて満たしたら完了。

1. `total`
2. `4クラス`
3. `国 distinct / ranking`
4. `都市 distinct / ranking`
5. `カテゴリ distinct / ranking`
6. `チェーン/アセット/accepting_any`
7. `asset matrix`

上記すべてが **「Map 母集合で集計した期待値」** と一致すること。

加えて:

- `docs/stats-v4.0-map-parity.checklist.md` が **全 OK**。
- `docs/audits/stats-v4.0-parity.audit.md` が **FULL COMPLIANCE**。

---

## 4. 受け入れ条件トレーサビリティ（NG項目→PR割当）

| 監査でNG/Partialだった項目 | 割当PR |
|---|---|
| 母集合一致（NG） | PR-1 |
| Total places（NG） | PR-1 |
| 4クラス（Partial） | PR-2 |
| Countries distinct/ranking（NG） | PR-3, PR-4 |
| Cities distinct/ranking（NG） | PR-3, PR-4 |
| Categories distinct/ranking（NG） | PR-3, PR-4 |
| Chains/Assets（Partial） | PR-5 |
| Asset Matrix（Partial） | PR-5 |
| promoted/source/verification軸非対称（NG） | PR-1, PR-2 |
| DB/JSON縮退整合（Partial） | PR-1, PR-6 |
| キャッシュ鮮度整合（NG） | PR-2, PR-5, PR-6 |

**判定:** NG/Partial 項目はすべて少なくとも1つ以上の PR に割当済み（漏れなし）。
