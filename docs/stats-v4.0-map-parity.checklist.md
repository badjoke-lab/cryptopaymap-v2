# Stats v4.0 Map Parity Checklist

- 目的: **Mapで表示される place 母集合** と **/api/stats が集計する母集合** の一致性を監査する。
- 判定基準: 「Mapに出るものはStatsに含まれる」こと。verification（owner/community/directory/unverified）の違いは母集合の包含条件に使わない。
- 対象: `components/map/*`, `app/api/places*`, `app/api/stats*`, `lib/stats/*`, `lib/history.ts`, `lib/dataSource.ts`。

---

## 1) Map母集合の定義チェック

### 1-1. データソース
- [ ] Map が `/api/places` を直接叩いていること（クエリ: bbox/limit + UIフィルタ）。
- [ ] `/api/places` が `DATA_SOURCE` 設定に応じて DB or JSON を返すこと。
- [ ] `x-cpm-limited` / `x-cpm-data-source` ヘッダで縮退状態を返すこと。

### 1-2. Map表示の必須条件（DB経路）
- [ ] `places` テーブルが存在すること。
- [ ] `lat/lng` が `NOT NULL` であること。
- [ ] `bbox` 条件内に入ること。
- [ ] 追加フィルタ（category/country/city/verification/payment/search）一致。
- [ ] **approve/promote/published 相当の WHERE 条件が存在しない**ことを確認（=表示母集合に承認状態フィルタがない）。

### 1-3. Map表示の必須条件（JSON経路）
- [ ] JSONでも `lat/lng` と bbox/各種フィルタが適用されること。
- [ ] JSON返却時は limited 扱いになること。

### 1-4. Map側キャッシュ
- [ ] サーバー `/api/places` の 20s キャッシュのキーに検索条件（bbox/filter/limit/offset）が含まれること。
- [ ] クライアント `MapClient` の requestKey キャッシュ（bbox+zoom+filter）が有効なこと。

---

## 2) Stats母集合の定義チェック

### 2-1. /api/stats のデータソース
- [ ] DB利用可能で auto/db のとき DB 集計を試行すること。
- [ ] DB不可時、auto では JSON (`lib/data/places`) fallback、db固定では 503 limited を返すこと。

### 2-2. /api/stats の DB母集合
- [ ] 母集合 CTE が `FROM places p` 起点であること。
- [ ] `lat/lng` の存在条件がないこと（Mapとの重要差分候補）。
- [ ] `approve/promote/published` 必須条件がないこと（promoted は任意フィルタとしてのみ適用）。
- [ ] verification は `verifications.level` 優先、無ければ `status` を代替として使うこと。
- [ ] `stats_cache` 参照時は total 系がキャッシュ値由来になること（鮮度差分候補）。

### 2-3. /api/stats/trends の母集合
- [ ] 母集合が `history` の `action in ('approve','promote')` で first_published を作る仕様であること。
- [ ] trends が Map表示母集合（現存 places）ではなく履歴起点であること。
- [ ] DB不可時は empty series（meta reasonつき）を返すこと。

---

## 3) 一致条件（Map vs Stats）

以下が全て満たされるときのみ「一致」と判定:

- [ ] 比較対象を同一スコープにする（同一 country/city/category/payment/verification/search 条件 + bbox/limit の扱いを明示）。
- [ ] Stats側に Mapと同じ必須条件（少なくとも `lat/lng` 非NULL）を適用できること。
- [ ] 同一データソース（DB同士 or JSON同士）で比較していること。
- [ ] キャッシュ時刻差が許容範囲内であること（`stats_cache`/API cache/client cache の差を排除）。
- [ ] limited mode の有無が両者で同一であること。

---

## 4) 再現可能な検証方法（手順書）

### 4-1. 事前固定
1. `DATA_SOURCE=auto`（もしくは `db`）で起動し、同一環境で実行する。
2. 比較時に使うフィルタを固定する（例: 無条件、または `country=JP` など）。
3. Map の bbox を固定する（同一URLの `bbox` クエリを使うか、APIを直接叩く）。

### 4-2. Map件数の取得
- 方法A（推奨・機械的）: Mapが実際に投げる `/api/places?...` の完全URLを取得し、`jq length` で件数を取る。
- 方法B（DB直接）: `/api/places` の WHERE と同等SQLで `COUNT(*)` する。

### 4-3. Stats件数の取得
- `/api/stats` を同一フィルタで呼び、`total_places` を取得。
- 併せてレスポンスヘッダの `x-cpm-data-source`, `x-cpm-limited` を記録。

### 4-4. 判定
- [ ] `map_count === stats.total_places`（比較スコープをbbox込みにした場合）
- [ ] 差分が出たら、(a) データソース差 (b) WHERE差 (c) キャッシュ差 (d) limited/fallback 差 の順に切り分ける。

### 4-5. 後続TASK用（実装しない）
- Playwright request context で以下を比較するスクリプトを作成予定:
  - `/api/places?...` 件数
  - `/api/stats?...` `total_places`
  - 両レスポンスの `x-cpm-data-source` / `x-cpm-limited`
