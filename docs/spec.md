# Spec — CryptoPayMap v2 (Authoritative)

This is the authoritative spec. Any legacy docs are included below as appendices.

## Canonical decisions
- Routes: /, /discover, /submit, /stats, /about, /donate, /internal
- Submissions are only: owner, community, report
- Place levels such as unverified or directory belong to Places, not to "submission kind".

## Appendices (legacy sources)


---

# 📄 **spec-v3.0.md — CryptoPayMap v2 全仕様インデックス（最終版）**

**Status:** FINAL
**Audience:** Codex / Gemini（実装エンジン）
**Purpose:**
CryptoPayMap v2 の **全 13 仕様書の参照点（インデックス）**。
本ファイルは「どの仕様が何を定義しているか」を明確化し、
**実装順・依存関係・責務境界** を 1 ファイルで示す。

---

# 0. ドキュメント一覧（v3 完全セット）

| #  | ファイル名                     | 役割 / 内容概要                                      |
| -- | ------------------------- | ---------------------------------------------- |
| 1  | **db-v3.0.md**            | DBスキーマ / インデックス / enum / constraints / PostGIS |
| 2  | **api-v3.0.md**           | REST API 全エンドポイント / 型定義 / エラー形式                |
| 3  | **ui-map-v3.2.md**        | PCカード / Mobile Popup / ピン / クラスタ / クリック挙動      |
| 4  | **ui-popup-v3.2.md**      | Mobile 専用 Bottom Sheet の全挙動                    |
| 5  | **ui-drawer-v3.2.md**     | 詳細 Drawer（PC右固定・Mobile全画面）                     |
| 6  | **filters-v3.0.md**       | フィルタ UI / メタデータ / クエリパラメータ                     |
| 7  | **stats-core-v3.md**      | 集計カテゴリ一覧・定義・数式                                 |
| 8  | **stats-etl-v3.md**       | DB → 統計生成の計算ルール（ETL）                           |
| 9  | **stats-trends-v4.md**    | 推移データの履歴化 / 保存周期 / API                         |
| 10 | **stats-dashboard-v5.md** | BI / Stats UI / グラフ仕様                          |
| 11 | **data-etl-v3.md**        | JSON → DB 移行 / 正規化ルール                          |
| 12 | **ops-v3.0.md**           | デプロイ・env・Neon接続 / ロールバック手順                     |
| 13 | **spec-v3.0.md**          | **本ファイル（全体インデックス）**                            |

---

# 1. 実装フェーズ（推奨順）

## **Phase 1 — コア（土台）**

1. `db-v3.0.md`（最優先）
2. `data-etl-v3.md`
3. `api-v3.0.md`

**目的:**
DB → 正規化 → API が揃うことで UI がつなげられる。

---

## **Phase 2 — マップ UI（閲覧機能）**

4. `ui-map-v3.2.md`
5. `ui-popup-v3.2.md`
6. `ui-drawer-v3.2.md`
7. `filters-v3.0.md`

**目的:**
マップで検索 → ピン → カード → Drawer の一連が成立。

---

## **Phase 3 — Stats（集計機能 v1）**

8. `stats-core-v3.md`
9. `stats-etl-v3.md`

---

## **Phase 4 — Stats 推移（v4 拡張）**

10. `stats-trends-v4.md`

---

## **Phase 5 — Stats Dashboard（v5 拡張）**

11. `stats-dashboard-v5.md`

---

## **Phase 6 — 運用・安定化**

12. `ops-v3.0.md`

---

# 2. 依存関係マップ（重要）

```
data-etl-v3.md  →  db-v3.0.md
api-v3.0.md     →  db-v3.0.md

ui-map / popup / drawer → api-v3.0.md
filters                 → api-v3.0.md

stats-etl               → db-v3.0.md
stats-core              → stats-etl
stats-trends            → stats-core
stats-dashboard         → stats-core + stats-trends
ops                     → 全仕様に依存
```

---

# 3. 命名規則（全仕様共通）

```
table names: snake_case
api routes: kebab-case
client components: PascalCase
db enum: lowercase
verification: owner/community/directory/unverified
```

---

# 4. UI コンポーネントの境界

| レイヤー     | ファイル                | 内容                     |
| -------- | ------------------- | ---------------------- |
| MapShell | `ui-map-v3.2.md`    | MapContainer / ピン・クラスタ |
| Popup    | `ui-popup-v3.2.md`  | Mobile 専用サマリー          |
| Drawer   | `ui-drawer-v3.2.md` | 詳細画面（PC右／Mobile全画面）    |

---

# 5. Stats の境界

| 段階  | ファイル                    | 内容            |
| --- | ----------------------- | ------------- |
| 定義  | `stats-core-v3.md`      | カテゴリ・計算項目の仕様  |
| ETL | `stats-etl-v3.md`       | DB → 統計データ化   |
| 推移  | `stats-trends-v4.md`    | 履歴の保存・更新周期    |
| 表示  | `stats-dashboard-v5.md` | BI / グラフ / UI |

---

# 6. API の統一ルール

### 形式

```
GET /api/places
GET /api/places/[id]
GET /api/stats
GET /api/filters/meta
```

### エラー

```
{
  error: "NOT_FOUND",
  message: "Place not found"
}
```

---

# 7. DB のバリデーション（全仕様横断）

* directory/unverified → media.images は常に 0 件
* owner/community → media.images 1〜8 件
* address.country は ISO-3166-1 alpha-2
* accepted[] は normalized（BTC / Lightning / ETH / USDT(Polygon)…）
* category は normalized（Bakery / Cafe / Store…）

---

# 8. これ以外の仕様書は存在しない（最終確定）

CryptoPayMap v2 の正式仕様書は **この 13 ファイルのみ**。
追加仕様書の作成は **絶対にしない**。
Codex に渡すときも **docs フォルダの13点だけ**。

---

# 9. Codex への渡し方

```
/docs/db-v3.0.md
/docs/api-v3.0.md
/docs/ui-map-v3.2.md
/docs/ui-popup-v3.2.md
/docs/ui-drawer-v3.2.md
/docs/filters-v3.0.md
/docs/stats-core-v3.md
/docs/stats-etl-v3.md
/docs/stats-trends-v4.md
/docs/stats-dashboard-v5.md
/docs/data-etl-v3.md
/docs/ops-v3.0.md
/docs/spec-v3.0.md ← 今ファイル
```

---

# 10. これで仕様書はすべて終了

このファイルが **CryptoPayMap v2 全仕様の親ファイル**。
以降はこのセットをそのまま Codex へ渡して構築するだけ。



---

# DATA_SOURCE / NEXT_PUBLIC_DATA_SOURCE

This controls how `/api/places`, `/api/stats`, and `/api/filters/meta` select their data source. The default is `auto` so the UI remains available even if the database is unavailable.

## Precedence

1. `DATA_SOURCE`
2. `NEXT_PUBLIC_DATA_SOURCE`
3. Default: `auto`

## Values and behavior

| Value | Behavior |
| --- | --- |
| `auto` | Try the DB first. If the DB is unreachable, times out, or throws an availability error, fall back to JSON. Valid empty DB results are returned as-is (no fallback). |
| `db` | Use the DB only. If the DB is unavailable, return `503`. |
| `json` | Always use JSON data (fallback mode). |

## Limited mode

When JSON data is used (forced or fallback), responses include `x-cpm-limited: 1`. This is used by the UI to show the Limited mode banner. DB-only errors can also return `x-cpm-limited: 1` to signal degraded data availability.

## Headers

Responses include these headers:

| Header | Description |
| --- | --- |
| `x-cpm-data-source` | `db` or `json` to indicate the source |
| `x-cpm-limited` | `1` when fallback/limited mode is active, `0` otherwise |

## Auto mode quick check

`auto` uses the DB when `DATABASE_URL` is configured and reachable; it falls back to JSON if the DB is unavailable or times out. If `DATABASE_URL` is not set, `auto` immediately uses JSON.

## Local fallback reproduction

1. Set `DATA_SOURCE=auto`.
2. Use an invalid `DATABASE_URL` (or stop your DB) to force a timeout/unavailable error.
3. Request `/api/places`, `/api/stats`, or `/api/filters/meta` and confirm headers `x-cpm-data-source: json` and `x-cpm-limited: 1`.

## Logging vs user-facing behavior

DB errors and timeouts are logged server-side. User-facing clients only receive the limited mode signal and safe fallback data (or `503` in `db` mode).


---

# JSON 完全廃止のための削除 PR 計画メモ（実行はしない）

目的: “消すならこれ” を文章化し、いつでも撤去できる状態にする（保険）。

> **重要**: このドキュメントは計画メモであり、ここに書かれた削除作業は**実行しない**。

## 影響範囲（削除対象）

- `data/places.json`
- `/api/places` の JSON fallback 分岐
- JSON 参照に関するドキュメント（今回の削除 PR で整理）

## 代替（DB 安定運用の前提条件）

JSON を完全廃止する前提として、DB を安定運用できることが必要。

- **再試行**: 一時的な DB 障害時のリトライ（指数バックオフ等）
- **キャッシュ**: 読み取り負荷の吸収と一時停止時の影響緩和
- **監視**: DB の可用性・遅延・エラー率の監視
- **アラート**: 閾値超過時の即時通知
- **運用手順**: 障害時の切り分け・復旧手順の整備

## 手順（削除する場合）

1. `data/places.json` を削除する。
2. `/api/places` の JSON fallback 分岐を削除する。
3. JSON 参照に関するドキュメントを削除または更新する。
4. 既存の動作確認項目に加えて「検証観点」を満たすかを確認する。

## ロールバック手順（問題が出たら戻す）

1. 削除した `data/places.json` を復元する。
2. `/api/places` の JSON fallback 分岐を復活させる。
3. JSON 参照のドキュメントを元に戻す。
4. 復元後の動作確認を行う。

## 検証観点

- DB 停止時の挙動（JSON fallback が無い状態のエラーハンドリング）
- `/stats` と `/submit` への影響がないこと
- `/api/places` の応答が DB のみで正しく動作すること
- リトライ・キャッシュが期待どおり機能すること

## 注意事項

- 本メモは **計画のみ** であり、削除作業は **実行しない**。
- 実行する場合は、必ず関係者合意と運用準備の完了後に行うこと。
