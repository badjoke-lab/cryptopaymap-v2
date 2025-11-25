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

