# API — CryptoPayMap v2 (Authoritative)

**Status:** Final / Implementation-Ready  
**Audience:** Codex / Owner / Review  
**Scope:** CryptoPayMap v2 の **全 API（REST / same-origin）** を Route Handlers で定義する。  
**Includes:** Places / Stats / Filters / Search / History **＋ Submissions（申請）＋ Internal（審査）＋ Media（申請画像配信）**

---

## 0. Global Rules（全API共通）

### 0.1 Framework / Hosting
- Next.js App Router の Route Handlers：`app/api/**/route.ts`
- same-origin 前提（CORSはデフォルト）
- DB: PostgreSQL + PostGIS（既存スキーマ利用）

### 0.2 Response: JSON + typed
- 原則 JSON
- 入力は必ず validate（Zod等）
- 返却型はTSで表現（UIが受け取るshapeを固定）

### 0.3 Error Format（統一）
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Place not found",
    "details": { "hint": "..." }
  }
}
````

* `details` は任意（デバッグに必要な最小限）
* 400/401/403/404/409/429/500 で返す

### 0.4 Cache Policy（基本）

* `/api/places` → `revalidate: 300`（5分）
* `/api/stats` → `revalidate: 7200`（2時間）
* `/api/filters/meta` → `revalidate: 3600`（1時間）
* `/api/media/**` → **galleryは cache可**、**internalは no-store**（後述）

### 0.5 Forbidden（禁止）

* DB migration を勝手に生成しない
* verification（owner/community/directory/unverified）を変更しない
* accepted 正規化ロジックを勝手に変えない
* v1参照で仕様改変しない

### 0.6 Required（必須）

* 全APIで input validate
* エラー形式統一
* 404/400/500 を正しく返す
* internal API は認可必須（401/403）
* **Mediaは public / internal を必ず分離**（gallery公開、proof/evidence非公開）

---

## 0.7 AuthN/AuthZ（Internal API）

internal 系は **運営のみ**が触れる。

### 0.7.1 認証方式（実装自由・仕様固定）

* 方式は実装都合で良い（例：Basic / Bearer / Cookie session）
* ただし挙動は固定：

  * 未認証 → 401
  * 認可失敗 → 403

### 0.7.2 Required Headers（例）

* `Authorization: Bearer <token>` または `Cookie: ...` 等
* **トークンや秘密値の“例”は docs に書かない**

---

## 1. API Routes 一覧

### 1.1 Public

| Route                                                         | 用途                                             |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `GET /api/places`                                             | 地図用の全店舗取得（軽量版）                                 |
| `GET /api/places/[id]`                                        | 個別店舗詳細（Drawer用）                                |
| `GET /api/places/by-id?id=...`                                | 個別店舗詳細（cpm/osm IDの安全取得）                     |
| `GET /api/stats`                                              | v3 コア統計                                        |
| `GET /api/filters/meta`                                       | UIフィルタ用メタデータ                                   |
| `GET /api/search`                                             | v2.1 予定の検索API                                  |
| `GET /api/history/[id]`                                       | v4 設計：店舗の推移データ（将来）                             |
| `POST /api/submissions`                                       | 申請（owner/community/report）送信（confirm画面でのみ最終送信） |
| `GET /api/media/submissions/[submissionId]/gallery/[mediaId]` | 公開可能な申請画像（gallery）配信                           |

### 1.2 Internal（運営審査）

| Route                                                                 | 用途                                     |
| --------------------------------------------------------------------- | -------------------------------------- |
| `GET /api/internal/submissions`                                       | 申請一覧（pending/approved/rejected）        |
| `GET /api/internal/submissions/[id]`                                  | 申請詳細（payload + 添付画像）                   |
| `POST /api/internal/submissions/[id]/approve`                         | 承認（status=approved + review_note等）     |
| `POST /api/internal/submissions/[id]/reject`                          | 却下（status=rejected + reason等）          |
| `POST /api/internal/submissions/[id]/promote`                         | 掲載反映（owner/communityのみ）                |
| `GET /api/internal/media/submissions/[submissionId]/[kind]/[mediaId]` | 非公開画像（proof/evidence）配信（認証必須・no-store） |

---

## 2. Types（主要型）

### 2.1 Place（Map用：軽量）

```ts
type PlaceLite = {
  id: string
  name: string
  lat: number
  lng: number
  verification: "owner" | "community" | "directory" | "unverified"
  category: string
  city: string
  country: string
  accepted: string[]   // BTC / BTC@Lightning / ETH / USDT@Polygon …
}
```

### 2.2 PlaceDetail（Drawer用）

```ts
type PlaceDetail = {
  id: string
  name: string
  verification: "owner" | "community" | "directory" | "unverified"
  category: string
  city: string
  country: string

  about: string | null
  about_short: string | null

  hours: string[] | null

  payments: {
    assets: string[]
    pages: string[]
  } | null

  contact: {
    website: string | null
    phone: string | null
    x: string | null
    instagram: string | null
    facebook: string | null
  } | null

  amenities: string[] | null

  media: string[]        // 公開写真URL（placeに紐づく）
  location: {
    address1: string | null
    address2: string | null
    lat: number
    lng: number
  }
}
```

### 2.3 Stats v3（コア）

```ts
type StatsCoreV3 = {
  total_places: number
  countries: number
  cities: number
  categories: number
  chains: Record<string, number>
}
```

### 2.4 Filters Meta

```ts
type FiltersMeta = {
  categories: string[]
  chains: string[]
  countries: string[]
  cities: string[] | Record<string, string[]>
}
```

### 2.5 Submissions（申請）

```ts
type SubmissionKind = "owner" | "community" | "report"
type SubmissionStatus = "pending" | "approved" | "rejected"

type Submission = {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  place_id: string | null

  payload: Record<string, unknown>       // 正規化済み
  submitted_by: Record<string, unknown>

  reviewed_by: Record<string, unknown> | null
  review_note: string | null

  created_at: string
  updated_at: string

  level: "owner" | "community" | "unverified" // 運用固定
}
```

#### submission_media

```ts
type SubmissionMediaKind = "gallery" | "proof" | "evidence"
type SubmissionMedia = {
  id: number
  submission_id: string
  kind: SubmissionMediaKind
  url: string            // 永続URL（署名URL禁止）
  caption?: string | null
  source?: string | null
  created_at: string
}
```

---

## 3. GET `/api/places`（Map用）

### 3.1 Description

地図描画の **軽量データのみ**返す（Drawer用の重いデータは返さない）

### 3.2 Query（all optional）

* `country`
* `city`
* `category`
* `chain`（複数可：`?chain=BTC&chain=ETH`）
* `verification`（複数可）
* `limit`（上限はサーバで丸める）

### 3.3 Response

`PlaceLite[]`

---

## 4. GET `/api/places/[id]`（Drawer用）

* Response：`PlaceDetail`

## 4.1 GET `/api/places/by-id?id=...`

* `id`: `cpm:...` / `osm:...` をクエリで指定
* Response：`PlaceDetail`

---

## 5. GET `/api/stats`（v3 核心統計）

* Response：`StatsCoreV3`

---

## 6. GET `/api/filters/meta`

* Response：`FiltersMeta`

---

## 7. GET `/api/search`（v2.1）

### 7.1 Query

* `q`（必須）
* optional: `country`, `city`, `category`（将来）

### 7.2 Response（最低限）

```ts
type SearchHit = { id: string; name: string; city: string; country: string; verification: string }
```

### 7.3 Notes（挙動固定）

* 部分一致（prefix/contains）は実装都合で良いが、**UIが期待する並び順を固定**：

  1. name match
  2. city match
  3. category match

---

## 8. GET `/api/history/[id]`（v4 将来）

* Response：最低限の形だけ固定（実装は将来）

---

## 9. POST `/api/submissions`（confirm画面でのみ最終送信）

**UIは入力→確認（Review）→最終送信**の2段。**最終送信は confirm 画面のみ**。

### 9.1 Content-Type（固定）

* `multipart/form-data`
* fields:

  * `payload`: JSON文字列（フォーム入力本体）
  * files（kindに応じて）

    * owner: `proof`(0..1) + `gallery`(0..8)
    * community: `gallery`(0..4)
    * report: `evidence`(0..4)

### 9.2 File validation（必須）

* mime: jpeg/png/webp
* size: ≤ 2MB
* count: kind別上限
* honeypot（あれば）検知で 400

### 9.3 Storage policy（必須）

* 申請画像の保存先は **Cloudflare R2 をデフォルト採用**（無料枠運用）
* DBにバイナリ保存しない
* `submission_media.url` は **永続URL**（署名URL禁止）
* **gallery は public配信**、**proof/evidence は internalのみ**

### 9.4 Success

#### 200/201

```json
{ "submissionId": "uuid", "status": "pending", "accepted": true }
```

#### 202（Degraded）

DB障害等で `data/submissions-pending.ndjson` に保留し **受理扱い**。

```json
{ "submissionId": "uuid", "status": "pending", "accepted": true, "degraded": true }
```

### 9.5 Errors

* 400: INVALID_INPUT / HONEYPOT / UNSUPPORTED_KIND / FILE_TOO_LARGE / FILE_TYPE_NOT_ALLOWED / TOO_MANY_FILES
* 429: RATE_LIMIT
* 500: INTERNAL

---

## 10. Media APIs（申請添付画像の配信）

### 10.1 Public gallery

`GET /api/media/submissions/[submissionId]/gallery/[mediaId]`

* 対象：`kind=gallery`
* 認証：不要
* Cache：可
* Response：画像バイナリ（`Content-Type: image/webp` 等）
* 404：存在しない / kind不一致

### 10.2 Internal proof/evidence（非公開）

`GET /api/internal/media/submissions/[submissionId]/[kind]/[mediaId]`

* kind: `proof | evidence`
* 認証：必須（運営のみ）
* Cache：禁止（`Cache-Control: no-store`）
* Response：画像バイナリ
* 403：権限なし
* 404：存在しない / kind不一致

---

## 11. Internal Submissions APIs（運営審査）

### 11.1 `GET /api/internal/submissions`

Query:

* `status=pending|approved|rejected`（default pending）
* `kind=owner|community|report`（任意）
* `limit`（任意）
* `cursor`（任意：keyset or opaque、実装都合で良い）

Response（最小）:

```ts
type SubmissionListItem = {
  id: string
  kind: "owner" | "community" | "report"
  status: "pending" | "approved" | "rejected"
  created_at: string
  place_id: string | null
  summary: { name?: string; country?: string; city?: string } // UI用の要約
}
```

### 11.2 `GET /api/internal/submissions/[id]`

Response:

* `Submission` + `submission_media[]`（kind別に並べ替え可）

### 11.3 `POST /api/internal/submissions/[id]/approve`

Body（JSON）:

* `review_note?: string`

Side effects:

* `status=approved`
* reviewed_by / approved_at 等の整合を取る
* **approve は “反映(promote)” をしない（分離）**（promoteでplacesへ反映）

Response:

* 更新後 `Submission`

### 11.4 `POST /api/internal/submissions/[id]/reject`

Body:

* `reject_reason?: string`（推奨）
* `review_note?: string`

Side effects:

* `status=rejected`

Response:

* 更新後 `Submission`

### 11.5 `POST /api/internal/submissions/[id]/promote`（owner/communityのみ）

Preconditions:

* kind in (owner, community)
* status == approved

Side effects（概念）:

* places を新規作成 or 更新
* place 公開mediaへ `gallery` を反映（proof/evidenceは公開禁止）
* payment_accepts / socials 等の正規化反映

Errors:

* 409：not approved / wrong kind
* 400：payload不足
* 500：反映失敗

Response（例）:

```json
{ "placeId": "cpm:...", "promoted": true }
```

---

## 12. Completion Checklist（API完成条件）

### Core

* [ ] `/api/places` 200 / フィルタ動作 / 軽量返却
* [ ] `/api/places/[id]` Drawer 全項目取得
* [ ] `/api/stats` v3 core と一致
* [ ] `/api/filters/meta` 揺れなし
* [ ] `/api/search` 部分一致 + 並び順妥当
* [ ] `/api/history/[id]`（将来）最低限レスポンス

### Submissions / Media / Internal

* [ ] `/api/submissions` multipart受理（confirmのみPOST）
* [ ] kind別上限/2MB/形式チェックが UI+API 両方で効く
* [ ] 200/201/202 のUI分岐が可能なレスポンス
* [ ] DB障害でも 202 + ndjson 保留
* [ ] `submission_media.url` は永続URL（署名URL禁止）
* [ ] public gallery / internal proof,evidence の配信分離＋no-store
* [ ] internal approve/reject/promote が動作（reportにpromoteなし）

