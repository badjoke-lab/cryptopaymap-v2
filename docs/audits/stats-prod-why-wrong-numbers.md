# Stats本番が「5」を返す原因の断定レポート（コード＋本番レスポンス）

## 1) 取得した本番レスポンス（証跡）

- 取得URL
  - `https://www.cryptopaymap.com/api/stats`
  - `https://www.cryptopaymap.com/api/stats/trends?range=7d`
- Playwright request context で取得時のHTTP情報
  - `/api/stats`: `200`, `x-cpm-data-source: json`, `x-cpm-limited: 1`
  - `/api/stats/trends?range=7d`: `200`, `x-cpm-data-source: db`, `x-cpm-limited: 0`
- 保存ファイル
  - `docs/audits/stats-prod-api-stats.json`
  - `docs/audits/stats-prod-api-trends-7d.json`

## 2) 「5」の正体（推測なし）

`/api/stats` の本番レスポンスは `total_places=5`、`countries=5`、`cities=5`、`categories=5`、`accepting_any_count=5` で、ランキング内訳（JP/US/FR/AU/CA 各1件）も固定5件データと一致している。これは保存したレスポンスJSONで確認できる。`meta` は含まれていない。  
→ 返っている「5」は DB 集計値ではなく、5件の固定フォールバック母集団に一致する値である。【F:docs/audits/stats-prod-api-stats.json†L2-L78】

コード上で「5件固定母集団」を作る実体は `lib/data/places.ts` の5件配列 `places`。フォールバック集計 `responseFromPlaces(...)` はこの `places` を `filteredPlaces.length` で直接 `total_places/total_count` に返す。したがって、全件フィルタ時に5件なら結果は5になる。【F:lib/data/places.ts†L3-L126】【F:app/api/stats/route.ts†L293-L309】【F:app/api/stats/route.ts†L382-L385】

## 3) なぜDB集計ではなくfallbackになったか（観測事実）

観測できる事実:
- 本番 `/api/stats` のレスポンスヘッダは `x-cpm-data-source: json` かつ `x-cpm-limited: 1`。
- これは `/api/stats` が DB 経路ではなく JSON 経路で返却されたことを示す（DB経路の返却ヘッダは `buildDataSourceHeaders("db", false)`）。【F:app/api/stats/route.ts†L712-L714】【F:app/api/stats/route.ts†L697-L699】【F:app/api/stats/route.ts†L724-L726】

コード上の JSON 返却分岐は2系統:
1. DBを試行しない分岐（`!hasDb || !shouldAttemptDb` かつ `shouldAllowJson`）で `responseFromPlaces(filters, places)` を返す。【F:app/api/stats/route.ts†L694-L700】
2. DB試行後の例外時に `shouldAllowJson` なら同じく `responseFromPlaces(filters, places)` を返す。【F:app/api/stats/route.ts†L715-L726】

この2分岐はいずれも「5件フォールバック」を返し得る。

## 4) reason特定可否（本番レスポンス基準）

- 今回保存した本番 `/api/stats` JSON には `meta.source/meta.limited/reason` が存在しない。【F:docs/audits/stats-prod-api-stats.json†L1-L78】
- そのため、上記2分岐のどちら（DB未試行か、DB失敗後フォールバックか）かを**レスポンスだけで一意に断定**することはできない。
- 一方、`/api/stats/trends?range=7d` は `meta.reason: "no_history_data"` を返しており、少なくとも trends ルートでは「履歴データ欠如」の空配列経路が動作していることが確認できる。【F:docs/audits/stats-prod-api-trends-7d.json†L39-L41】【F:app/api/stats/trends/route.ts†L329-L337】

## 5) 「5」を生成しうるコード箇所（行番号付き）

1. **固定5件データ本体**: `lib/data/places.ts` の `places` 配列（5レコード）。【F:lib/data/places.ts†L3-L126】
2. **fallback集計本体**: `responseFromPlaces(...)` が `sourcePlaces` を母集団に集計し、`total_places=filteredPlaces.length` を返す。【F:app/api/stats/route.ts†L293-L309】【F:app/api/stats/route.ts†L382-L385】
3. **fallback返却分岐A（DB未試行）**: `!hasDb || !shouldAttemptDb` で `responseFromPlaces(filters, places)` を返す。【F:app/api/stats/route.ts†L694-L700】
4. **fallback返却分岐B（DB失敗後）**: `catch` 内で `shouldAllowJson` のとき同関数を返す。【F:app/api/stats/route.ts†L715-L726】
5. **DB利用可否の起点**: `hasDatabaseUrl()` は `DATABASE_URL` の有無で判定。設定なしなら DB 非利用側に倒れる。【F:lib/db.ts†L111-L118】

## 6) 最短修正案（1〜3案）

1. **最優先（安全）**: `/api/stats` で `json fallback` 時は数値を返さず `503 + meta.reason` を必須化し、固定5件集計を無効化する。これで「5」の再発を即時停止できる。
2. **診断性向上**: `/api/stats` の全レスポンスで `meta.source/meta.limited/reason` を必須にし、分岐A/Bを運用で即判別可能にする。
3. **恒久対応**: 本番環境で `DATABASE_URL` と `DATA_SOURCE=auto|db` を監査し、`x-cpm-data-source=json` を監視アラート化する（json応答を異常扱い）。

---

結論（断定）:
- 本番で見えている「5」は、`/api/stats` が DB 集計ではなく JSON fallback 経路に入り、5件固定データを集計して返した値である。【F:docs/audits/stats-prod-api-stats.json†L2-L78】【F:app/api/stats/route.ts†L293-L309】【F:lib/data/places.ts†L3-L126】
