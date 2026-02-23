# Stats-Map Parity 開発計画（TASK-B / 実装禁止）

- 対象入力:
  - `docs/audits/stats-v4.0-map-parity.audit.md`
  - `docs/stats-v4.0-map-parity.checklist.md`
  - 整合参照: `docs/stats-v4.0.md`, `docs/stats-v4.1.md`
- 目的:
  - 「Stats が Map 母集合を集計する」を段階的に実現し、Map 表示件数と `/api/stats` の `total_places` を同一条件で一致させる。
- 制約:
  - この文書は **開発計画のみ**。実装仕様の確定と PR 分割までを扱い、コード変更は行わない。

---

## 0. 原則（v4.0/v4.1との矛盾回避）

1. **母集合の一次定義は Map 側に寄せる。**
   - `places` 現在値 + Map 実表示条件（少なくとも `lat/lng NOT NULL`、bbox、UI フィルタ）を正とし、Stats が追従する。
2. **limited/fallback は「整合優先」で扱う。**
   - Map と Stats でデータソース・縮退状態を揃えられない場合は、Stats 側で「数値を出さない（または null + 理由表示）」を許可する。
3. **キャッシュは鮮度差分を可視化し、比較可能性を担保する。**
   - レスポンスメタに `data_source` / `limited` / `generated_at` / `cache_hit` を明示し、検証時の切り分けを容易化。
4. **段階導入 + feature flag を許容する。**
   - API 契約→母集合共通化→fallback/キャッシュ統合→検証自動化の順で進め、各 PR を独立監査可能にする。

---

## 1. 原因別の修正戦略

### 1-1. データソース統一（Map/Stats の DB/JSON 経路差分解消）

- 問題:
  - 現在は `/api/places` と `/api/stats` が個別に DB→JSON fallback を判断し、片側だけ JSON 化する可能性がある。
- 戦略:
  - `lib/dataSource.ts` に「このリクエストで使うデータソース決定」を集約し、Map/Stats で同一判定ロジックを共有。
  - `/api/stats` はレスポンスヘッダ/メタで Map と同等の `x-cpm-data-source`, `x-cpm-limited` を返す。
  - 共有判定不可（例: Stats だけ DB 不可）時は parity 不能扱いとして `total_places` を null 化できる契約を追加。

### 1-2. 母集合 WHERE 条件の統一（published/除外条件/座標条件）

- 問題:
  - Stats 側に `lat/lng` 必須条件がなく、Map と集合がズレる。
  - bbox/limit スコープが Stats の全体集計と一致しない。
- 戦略:
  - `/api/stats` に **Map parity mode** を導入（例: `scope=map` + `bbox` + `limit/offset` + 同一 filter）。
  - parity mode の SQL 生成を `/api/places` と共通化（WHERE 生成関数の共通モジュール化）。
  - `approved/published` については監査結果に従い「Map 側で必須にしていないため Stats でも必須化しない」を明示（将来仕様変更時は両者同時変更）。

### 1-3. limited mode / fallback 発火是正

- 問題:
  - Stats は縮退時でも値を返せる経路があり、Map の表示母集合と一致しない値を UI に出し得る。
- 戦略:
  - parity mode では **縮退時に不整合な数値を返さない** 方針を採用。
  - 返却案:
    - `total_places: null`
    - `meta.parity_status: "unavailable_due_to_limited_mode"`
    - `meta.reason` に `data_source_mismatch` / `limited_mode` を列挙
  - UI は null を「N/A（縮退中）」表示に統一し、誤差のある実数表示を禁止。

### 1-4. キャッシュ戦略見直し（鮮度統一）

- 問題:
  - Map（20s API + client requestKey）と Stats（`stats_cache` + API cache）の鮮度軸が異なる。
- 戦略:
  - parity mode では `stats_cache` の使用条件を制限（Map と同等比較ができる条件時は生集計優先、または共通キャッシュキー採用）。
  - `cache_key` に bbox/filter/limit/offset/data_source を含める。
  - 検証のため `generated_at` / `cache_age_ms` を `meta` で返す。

---

## 2. PR分割計画

## PR-1: API 契約とスコープ定義の先行整備

- 目的:
  - Map 比較に必要な入力/出力契約を先に固定し、以降 PR の実装対象を明確化する。
- 変更対象ファイル（具体名）:
  - `app/api/stats/route.ts`
  - `lib/types/stats.ts`
  - `docs/stats-v4.0.md`
  - `docs/stats-v4.1.md`
  - `docs/stats-v4.0-map-parity.checklist.md`
- 追加/変更する API フィールド:
  - query 追加（`/api/stats`）: `scope=map|global`, `bbox`, `limit`, `offset`
  - response 追加:
    - `meta.data_source`
    - `meta.limited`
    - `meta.parity_scope`
    - `meta.parity_status`
    - `meta.generated_at`
- DB クエリ/条件の変更点:
  - この PR では仕様定義のみ（実クエリの本体変更は PR-2）。
- 検証方法:
  - 自動: 型チェック / API schema テスト追加（契約テスト）。
  - 手動: `/api/stats?scope=map&bbox=...` が新メタを返すことを確認。

## PR-2: Map/Stats 共通母集合ビルダー導入（WHERE 統一）

- 目的:
  - Map が使う母集合条件を共通関数化し、Stats parity mode が同一集合を集計できるようにする。
- 変更対象ファイル（具体名）:
  - `app/api/places/route.ts`
  - `app/api/stats/route.ts`
  - `lib/stats/filters.ts`（新規想定）
  - `lib/stats/dashboard.ts`
- 追加/変更する API フィールド:
  - PR-1 の `scope=map` を実動作化。
- DB クエリ/条件の変更点:
  - `lat/lng IS NOT NULL` を parity mode に必須適用。
  - `bbox` / filter 条件生成を `/api/places` と共通実装に統一。
  - `limit/offset` の扱いを明示（Map 表示件数との比較モードでは同値適用）。
- 検証方法:
  - 自動: 単体テスト（同一入力に対し places/stats の WHERE 文字列が一致）。
  - 手動: 固定 bbox/filter で `map_count === stats.total_places` を確認。

## PR-3: limited/fallback 整合化（不整合時は数値非表示）

- 目的:
  - データソース差・縮退差で誤った一致を見せないようにする。
- 変更対象ファイル（具体名）:
  - `app/api/stats/route.ts`
  - `app/(site)/stats/StatsPageClient.tsx`
  - `lib/dataSource.ts`
  - `lib/stats/utils.ts`
- 追加/変更する API フィールド:
  - `total_places: number | null`（parity unavailable 時 null 許容）
  - `meta.reason[]`
  - `meta.parity_status`（`ok` / `unavailable_due_to_limited_mode` / `unavailable_due_to_source_mismatch`）
- DB クエリ/条件の変更点:
  - DB 不可時の fallback 判定を共通化し、Map/Stats の data source を同期。
  - 非同期化できないケースでは Stats は null 返却へ切替。
- 検証方法:
  - 自動: API テスト（DB unavailable, DATA_SOURCE=db/auto 各ケース）。
  - 手動: limited 時に Stats が N/A 表示になることを確認。

## PR-4: キャッシュ戦略統合（鮮度差分の抑制）

- 目的:
  - Map/Stats 比較時にキャッシュ起因のズレを抑制する。
- 変更対象ファイル（具体名）:
  - `app/api/places/route.ts`
  - `app/api/stats/route.ts`
  - `lib/stats/dashboard.ts`
  - `components/map/MapClient.tsx`
- 追加/変更する API フィールド:
  - `meta.cache_hit`
  - `meta.cache_age_ms`
  - `meta.cache_key_fingerprint`
- DB クエリ/条件の変更点:
  - `stats_cache` 使用条件を parity mode で厳格化（または bypass）。
  - 共通 cache key 構成（bbox/filter/limit/offset/data_source）。
- 検証方法:
  - 自動: キャッシュキー生成テスト、TTL テスト。
  - 手動: 同条件連続呼び出しで Map/Stats の鮮度メタが揃うことを確認。

## PR-5: 監査用自動検証と受け入れクローズ

- 目的:
  - checklist 全項目を再現可能に検証し、運用時の再発防止を組み込む。
- 変更対象ファイル（具体名）:
  - `tests/audit/stats-map-parity.api.test.ts`（新規）
  - `scripts/audit/stats_map_parity_check.mjs`（新規）
  - `docs/audits/stats-v4.0-map-parity.audit.md`
  - `docs/stats-v4.0-map-parity.checklist.md`
- 追加/変更する API フィールド:
  - なし（検証中心）。
- DB クエリ/条件の変更点:
  - なし（既存変更の検証のみ）。
- 検証方法:
  - 自動: `/api/places` 件数と `/api/stats` `total_places` の比較を複数フィルタで実施。
  - 手動: 監査手順 4-1〜4-4 に沿って spot check。

---

## 3. 実行順序と依存

1. **PR-1（契約固定）**
2. **PR-2（母集合共通化）**
3. **PR-3（limited/fallback是正）**
4. **PR-4（キャッシュ統合）**
5. **PR-5（監査自動化・監査クローズ）**

依存関係:
- PR-2 は PR-1 の API 契約確定が前提。
- PR-3 は PR-2 の母集合一致が前提（縮退時ポリシー適用）。
- PR-4 は PR-2/3 の挙動固定後に実施（キャッシュを最適化するため）。
- PR-5 は全 PR 完了後に実施。

---

## 4. 完了条件（Definition of Done）

以下をすべて満たしたとき完了:

1. **件数一致**
   - 同一条件（country/city/category/payment/verification/search + bbox + limit/offset + data_source）で、
   - `Map表示件数（/api/places 件数） === /api/stats total_places`。
2. **縮退時の安全性**
   - limited/source mismatch 時に Stats が誤差ある実数を返さない（null + 理由表示）。
3. **鮮度説明可能性**
   - Map/Stats 双方で `data_source`, `limited`, `generated_at`, `cache` 情報が比較可能。
4. **チェックリスト達成**
   - `docs/stats-v4.0-map-parity.checklist.md` が全 OK。
5. **監査更新**
   - `docs/audits/stats-v4.0-map-parity.audit.md` の判定が改善（最終的に COMPLIANT）。

---

## 5. リスクと先回り対応

- リスクA: bbox/limit を Stats に導入すると既存利用者が global 値と混同する。
  - 対応: `scope=global` をデフォルト維持し、`scope=map` を明示 opt-in。
- リスクB: `stats_cache` 抑制でレスポンス遅延。
  - 対応: parity mode のみ制限し、global には既存最適化を維持。
- リスクC: JSON fallback 時の map/stats 同期が難しい。
  - 対応: 同期不能時は null 戻し + UI 注記を正とする（誤値表示回避）。

---

## 6. この計画で「実装しないこと」

- v4.1 の保存キューブ拡張そのもの（時系列高度化）は本計画の対象外。
- `/api/stats/trends` の母集合変更は、Map-Stats parity（snapshot total 一致）達成後の別タスクで扱う。
- place 承認ワークフロー（approve/published 定義変更）は、Map 側要件変更が確定するまで着手しない。
