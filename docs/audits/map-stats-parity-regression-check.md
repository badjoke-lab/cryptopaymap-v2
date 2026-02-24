# 監査メモ: Map/Stats 母集合の再発防止チェック仕様

## 目的
- 「一度一致した母集合が次PRで戻る」回帰をCI相当で即時検知する。

## 仕様（最小）
1. Stats契約値の固定確認
   - `app/api/stats/route.ts` の `MAP_POPULATION_ID` が `places:map_population:v2` であること。
2. 母集合件数の一致確認
   - A（Map母集合）: `places` の `lat IS NOT NULL AND lng IS NOT NULL`
   - B（Stats母集合）: Stats側母集合クエリ（同一述語）
   - `|A| == |B|` を必須とする。
3. 集合差分の一致確認
   - `A\B == 0` かつ `B\A == 0` を必須とする。

## 実行
- `npm run validate:map-stats-parity`

## 実行条件
- `DATABASE_URL` がある環境で実行。
- ローカルで `DATABASE_URL` がない場合はスキップ（非失敗）。
- CI（`CI=true`）または `REQUIRE_DB_VALIDATION=true` では `DATABASE_URL` 未設定を失敗扱いにする。
