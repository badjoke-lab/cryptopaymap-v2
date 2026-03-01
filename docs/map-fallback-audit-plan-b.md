# AUDIT: Map fallback mode (current) → Snapshot fallback (Plan B prep)

## Scope / evidence base
- This report covers only repository-confirmed behavior for Map fallback.
- Primary path audited: `MapClient` → `/api/places`.

---

## A) フォールバックが発火する条件

### A-1. どの失敗でフォールバックへ入るか

**対象ファイル / 関数**
- `app/api/places/route.ts` / `GET` + `loadPlacesFromDb` + `loadPlacesFromJson`
- `lib/dataSource.ts` / `getDataSourceSetting`, `getDataSourceContext`, `withDbTimeout`
- `lib/db.ts` / `dbQuery`, `getDbClient`, `DbUnavailableError`

**重要行（抜粋）**
- `app/api/places/route.ts`: `GET` のsource判定/DB試行/JSON分岐 (`661-665`, `755-770`, `813-833`, `890-899`)。
- `app/api/places/route.ts`: `loadPlacesFromDb` 例外時 `null` (`648-654`)、`loadPlacesFromJson` (`266-277`)。
- `lib/dataSource.ts`: timeout/fallback方針 (`11-17`, `48-66`)。
- `lib/db.ts`: 一過性DB障害の `DbUnavailableError` 化 (`69-85`, `145-147`, `178-180`)。

**発火条件（DB→JSON fallbackに入る）**
- `DATA_SOURCE`(or `NEXT_PUBLIC_DATA_SOURCE`) が `auto` で、DB試行後 `dbPlaces === null` の場合、JSONフォールバックへ進みます。`GET` 内で `if (dbPlaces !== null)` でDBレスポンスを返し、`null` のときに `loadPlacesFromJson()` へ進みます。
  - 根拠: `app/api/places/route.ts` の `getDataSourceContext` 利用、DB試行、`dbPlaces !== null` 判定、JSON分岐。
- DBタイムアウトは `withDbTimeout(..., { message: "DB_TIMEOUT" })` で `DbUnavailableError` として扱われ、`auto` ではJSONへフォールバックします（`db`固定時は503）。
  - 根拠: `lib/dataSource.ts` の `DEFAULT_DB_TIMEOUT_MS = 4500` と `Promise.race`。
- DB接続/クエリの一部障害は `DbUnavailableError` または `loadPlacesFromDb` 側で `null` 返却となり、`auto` でJSONフォールバックします。
  - `DbUnavailableError` は `dbQuery/getDbClient` の一過性通信障害で送出。
  - `loadPlacesFromDb` は一般例外時 `return null`。
- `hasDatabaseUrl()` が false で DB非利用の場合、`auto` では JSON が使われます（`shouldAttemptDb=false`, `shouldAllowJson=true`）。

**フォールバックにならない条件（重要）**
- **DB結果が空配列 `[]`** は「有効なDB結果」であり、`dbPlaces !== null` に該当するためJSONフォールバックしません。
- **404/500判定**は `/api/places` のDB取得ロジックでは直接分岐していません。Mapクライアント側は `response.ok` で失敗扱いし、APIが503ならUIエラー表示になります（JSONフォールバックはサーバー側で既に決まっている）。
- **invalid shape**（JSON schema検証）によるフォールバック分岐は実装されていません。`response.json()` の結果を `Place[]` として扱っています。

### A-2. フォールバック解除条件

**対象ファイル / 関数**
- `components/map/MapClient.tsx` / `fetchPlacesForBbox`, `fetchPlacesRef`
- `app/api/places/route.ts` / `placesCache`（20s）

**重要行（抜粋）**
- `components/map/MapClient.tsx`: limitedフラグ更新 (`659`, `673`)、Retry導線 (`1288-1291`)、client cache (`618-627`, `676-681`)。
- `app/api/places/route.ts`: server cache TTL (`69`, `745-751`, `890-899`)。

**解除条件**
- 次回リクエストでDB取得に成功し、`x-cpm-limited=0` かつ `x-cpm-data-source=db` が返ると、クライアントの `limitedMode` は `false` に戻ります。
- 解除にフルリロードは必須ではありません。Map内部リトライ（Retryボタン）や move/zoom による再fetchでも復帰可能です。
- ただし、同一request keyのクライアントキャッシュ（`placesCacheRef`）を先にヒットすると、その時点で保持している limited フラグを再利用します。別キー取得またはキャッシュ更新で反映されます。
- API側にも20秒TTLキャッシュがあり、同一クエリは短時間キャッシュ結果が返ります。

---

## B) フォールバックで表示される「テスト5件」の所在

### B-1. データの所在

**対象ファイル / 関数**
- `data/places.json`（JSON実体、5件）
- `app/api/places/route.ts` / `loadPlacesFromJson`（`data/places.json` を読む）
- `lib/data/places.ts`（同等の5件配列。主にDB補完/詳細fallback側で利用）

**重要行（抜粋）**
- `app/api/places/route.ts`: fallback JSON読込パス (`268-270`)。
- `data/places.json`: 実データ5件 (`1-124`)。
- `lib/data/places.ts`: 5件配列 (`3-126`)。

**確認結果**
- Map APIフォールバック本体は `data/places.json` を直接読みます。
- 5件データは以下ID:
  - `cpm:tokyo:owner-cafe-1`
  - `cpm:newyork:community-diner-1`
  - `cpm:paris:directory-bistro-1`
  - `cpm:sydney:unverified-bookstore-1`
  - `cpm:toronto:owner-bakery-1`

### B-2. shape（Place必須項目/fields）

**対象ファイル / 関数**
- `types/places.ts` / `Place`
- `app/api/places/route.ts` / `toSummaryPlus`

**重要行（抜粋）**
- `types/places.ts`: 必須/互換fields定義 (`1-34`)。
- `app/api/places/route.ts`: summary-plus整形 (`72-95`, `214-238`)。

**確認結果**
- `Place` の中核必須は `id,name,category,verification,lat,lng,country,city`。
- APIレスポンスは `toSummaryPlus` で summary-plus shape に整形され、`accepted,address_full,about_short,paymentNote,amenities,phone,website,twitter,instagram,facebook,coverImage` を返します。

### B-3. Map側での利用範囲

**対象ファイル / 関数**
- `components/map/MapClient.tsx` / `fetchPlacesForBbox`, `buildIndexAndRender`, `renderPlaceList`

**重要行（抜粋）**
- `components/map/MapClient.tsx`: `/api/places` fetch〜state反映 (`652-676`)。
- `components/map/MapClient.tsx`: marker index構築 (`596-600`)。
- `components/map/MapClient.tsx`: list/count系描画 (`1252-1262`, `1053-1055`)。

**確認結果**
- フォールバックデータも通常データと同じ `places` state に入り、以下に同時利用されます。
  - Marker/cluster描画（`buildIndexAndRender`）
  - 左リスト（desktop）
  - Mobile bottom sheet遷移用選択元
  - フィルタ表示件数、limit notice判定
- したがって「5件テストデータ」は markers/list/drawer選択などMap主要UI全体で使われます。

---

## C) フォールバック時のUI表示

### C-1. 文言・コンポーネント

**対象ファイル / 関数**
- `components/status/LimitedModeNotice.tsx` / `LimitedModeNotice`
- `components/map/MapClient.tsx` / `limitedMode` 表示分岐
- `components/map/MapFetchStatus.tsx` / fetch失敗時表示

**重要行（抜粋）**
- `components/status/LimitedModeNotice.tsx`: 文言定義 (`8-19`)。
- `components/map/MapClient.tsx`: limitedバナー分岐 (`1286`)。
- `components/map/MapFetchStatus.tsx`: エラー表示文言/Retry (`15-20`)。

**確認結果**
- フォールバック（`x-cpm-limited=1` or source=json）時、Map上部に `Limited mode` バナー表示。
  - 文言: `Data may be partial (fallback mode). Try again later.`
- API失敗（例: 503）時は別系統で `Failed to load markers. Retry` が表示。
- 2つは同時に出る可能性があります（limitedは成功レスポンス由来、fetch-statusはエラー由来）。

### C-2. 表示位置 / スタイル

**対象ファイル / 関数**
- `components/map/MapClient.tsx` / overlay構造（`cpm-map-overlay`, `cpm-map-overlay__top`）
- `components/map/map.css` / overlay・status系class

**重要行（抜粋）**
- `components/map/MapClient.tsx`: overlay内配置 (`1265-1293`)。
- `components/map/map.css`: overlay z-index/layout (`261-283`)。
- `components/map/map.css`: fetch statusスタイル (`181-195`)。

**確認結果**
- `LimitedModeNotice` は `.cpm-map-overlay__top` 内（上部帯）に配置。
- `MapFetchStatus` は overlay内で `.cpm-map-fetch-status`（右寄せ）表示。
- overlay全体は `position:absolute; inset:0; z-index:210;`。

### C-3. 既存バナー/noticeとの干渉

**対象ファイル / 関数**
- `components/map/MapClient.tsx` / `renderAntarcticaDemoNotice`, `renderMobileFilters`
- `components/map/map.css` / z-index定義

**重要行（抜粋）**
- `components/map/MapClient.tsx`: Antarctica notice fixed配置/z-index (`943-948`)。
- `components/map/map.css`: mobile filters z-index (`294-305`)、sheet/backdrop z-index (`319-333`)。

**確認結果**
- 南極デモnoticeは `position:fixed; z-index:16000`（右下寄り）で、overlay (`z-index:210`) より前面。
- mobile filters は `z-index:15000`、sheet/backdrop は `19000/19001` でさらに前面。
- よって重なり優先順位は **mobile filter sheet > antarctica notice > map overlay notices**。

---

## D) データソースの流れ（通常時）

### D-1. 通常時フロー（テキスト図）

**対象ファイル / 関数**
- `components/map/MapClient.tsx` / `fetchPlacesForBbox`
- `app/api/places/route.ts` / `GET`, `loadPlacesFromDb`
- `lib/dataSource.ts` / source判定

**重要行（抜粋）**
- `components/map/MapClient.tsx`: fetchとlimitedヘッダ解釈 (`652-660`)。
- `app/api/places/route.ts`: `GET` のdata source判定 (`661-665`)。
- `app/api/places/route.ts`: DB成功分岐 (`813-823`) とJSON分岐 (`833-899`)。

**フロー図**
1. `MapClient` が bbox/filter から query を生成し `/api/places?...` を fetch。  
2. API `GET` が data source setting (`auto/db/json`) を解決。  
3. `auto` かつ DB利用可能なら `loadPlacesFromDb` を `withDbTimeout(4500ms)` で実行。  
4. DB成功 (`dbPlaces !== null`) なら DBデータ返却（`x-cpm-data-source=db`, `x-cpm-limited=0`）。  
5. DB不成立でJSON許可時は `data/places.json` 読込→filter→整形して返却（`source=json`, `limited=1`）。  
6. `MapClient` はヘッダで `limitedMode` を更新しUI表示切替。

### D-2. キャッシュ/再検証

**対象ファイル / 関数**
- `app/api/places/route.ts` / `placesCache`, `CACHE_TTL_MS=20_000`
- `components/map/MapClient.tsx` / `placesCacheRef`, `buildRequestKey`

**重要行（抜粋）**
- `app/api/places/route.ts`: cache TTL/key/hit (`69`, `745-751`, `890-895`)。
- `components/map/MapClient.tsx`: requestKey生成/キャッシュヒット (`602-603`, `618-627`, `676-681`)。

**確認結果**
- サーバー側メモリキャッシュ: 20秒TTL、キーは正規化query。
- クライアント側メモリキャッシュ: requestKey（bbox+zoom+filters）で保持、最大30キー。
- SWR/revalidate指定は Map APIルート内で利用していません（独自メモリキャッシュ方式）。

---

## E) Plan B（スナップショット）を入れるポイント

### E-1. snapshot JSON配置候補（自然な置き場所）

**候補1（最短）**
- `data/fallback/published_places_snapshot.json`
- 理由: 現行 `loadPlacesFromJson` はサーバー側で `data/places.json` をFS読込しており、差し替えが最小。

**候補2（安全/配信分離）**
- `public/fallback/published_places_snapshot.json`
- 理由: 静的配信物として明示でき、監査時に取得容易。ただし現行APIのFS読込経路とは別運用になる。

### E-2. 差し替えポイント（テスト5件→snapshot）

**最短案**
- `app/api/places/route.ts` の `loadPlacesFromJson` 参照先を `data/places.json` から snapshot JSON へ変更。
- 併せて `lib/data/places.ts`（DB補完・detail fallback用）を snapshot整合データへ置換するか、用途分離して明示。

**安全案**
- `loadPlacesFromJson` を `loadPlacesFromSnapshot` に改名し、`meta.last_updated` 付きschemaを受ける新ローダを追加。
- 既存 `data/places.json` は移行期間だけ残し、feature flagで切替。

### E-3. “Snapshot mode / Last updated” 表示場所

**流用可能ポイント**
- 既存 `LimitedModeNotice` を拡張し、fallback種別（snapshot）と `last_updated` を表示するのが最小。
- 位置は現行と同じ `MapClient` の overlay top が自然。

**短文案（UI文言）**
- タイトル: `Snapshot mode`
- 本文: `Showing approved snapshot data while live data is unavailable.`
- 補足: `Last updated: 2026-.. UTC`

### E-4. is_demo の扱い

**現状根拠**
- Map表示条件は `lat/lng` のみで、`is_demo` 除外はMap側に存在しません。
- Stats/Discover は `COALESCE(...is_demo,false)=false` で除外済み。

**重要行（抜粋）**
- `lib/stats/mapPopulation.ts`: map displayable条件はlat/lngのみ (`6-17`)。
- `app/api/stats/route.ts`: stats側のnon-demo clause (`387`, `518`)。
- `lib/discover/server.ts`: discover側のnon-demo clause (`168`)。

**Plan B準備方針**
- snapshot生成時点で `is_demo=false` のみ抽出（推奨）にすれば、Map fallbackでも demo混入を防止可能。
- 生成クエリ条件に `COALESCE(p.is_demo, false) = false` を必須化する。

---

## F) 生成・更新（後続PR向け準備）

### F-1. snapshot生成データ条件（提案）

- `published`（公開対象）
- `verified`（品質要件に合わせる。verification level要件は別途確定）
- `lat/lng` が有限値
- `is_demo=false`
- Mapレスポンスに必要なsummary-plus相当フィールドを満たす

### F-2. 生成スクリプト置き場所候補

- `scripts/build-map-fallback-snapshot.ts`（既存慣例: `scripts/`配下）
- 出力先は `data/fallback/...json`（API内FS読込と整合）または `public/fallback/...json`（静的配信重視）

### F-3. “last updated” の埋め込み方式

- 推奨: snapshot JSON内に `meta` オブジェクトを持たせる。
  - 例: `{ meta: { last_updated: "...", source: "db" }, places: [...] }`
- 代替: 別メタファイル運用（`...meta.json`）

### F-4. GitHub Actions要件（後続PR ToDo）

- DB read-only接続情報（`DATABASE_URL` 相当）または snapshot source API資格情報。
- 生成jobでの secrets 管理（repo/environment secrets）。
- 生成物commitポリシー（自動commitか手動承認か）を先に決定。

---

## Plan B実装のための変更点チェックリスト（DoD草案）

- [ ] `/api/places` の JSON fallback ソースを「テスト5件」から「承認済み snapshot」へ差し替え。
- [ ] `x-cpm-limited=1` 時のバナー文言を `Snapshot mode` に更新。
- [ ] バナーに `Last updated`（snapshot meta）を表示。
- [ ] fallbackデータに `is_demo` が混入しないことを生成条件で保証。
- [ ] 既存 `data/places.json` / `lib/data/places.ts` の役割を整理（不要なら削除、必要なら用途限定）。
- [ ] Mapの marker/list/drawer で snapshot shape が既存互換であることを確認。
- [ ] API/Client両キャッシュ下で fallback→DB復帰時の表示遷移を確認。
- [ ] E2E/統合テストに「DB不可時にsnapshot表示」「limited/snapshot notice表示」を追加。
