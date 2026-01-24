# API — CryptoPayMap v2 (Authoritative)

**Status:** Final / Implementation-Ready  
**Audience:** Codex / Owner / Review  
**Scope:** CryptoPayMap v2 の **全 API（REST / same-origin）** を Route Handlers で定義する。  
**Includes:** Places / Stats / Filters / Search / History **＋ Submissions（申請）＋ Internal（審査）＋ Media（申請画像配信）**

---

## 0. Global Rules（全API共通）

### 0.1 Framework / Hosting
- Next.js App Router の Route Handlers を使用：`app/api/**/route.ts`
- 同一オリジン前提（CORSはデフォルト）
- DB: PostgreSQL + PostGIS（Neon等）既存スキーマ利用

### 0.2 Response: JSON + typed
- すべて JSON を返す
- 可能な限り typed（TS型で表現し、入力はvalidateする）

### 0.3 Error Format（統一）
全APIのエラーは統一フォーマット：

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
* 400/401/403/404/409/429/500 などで返す

### 0.4 Cache Policy（基本）

* `/api/places` → `revalidate: 300`（5分）
* `/api/stats` → `revalidate: 7200`（2時間）
* `/api/filters/meta` → `revalidate: 3600`（1時間）
* `/api/media/**` → galleryは cache可、internalは cache禁止（後述）

### 0.5 Forbidden（禁止）

* DB migration を勝手に生成しない
* verification 名（owner/community/directory/unverified）を変更しない
* accepted 正規化ロジックを勝手に変えない
* v1のコード参照で仕様を改変しない

### 0.6 Required（必須）

* 全APIに input validate
* エラー形式統一
* 404/400/500 を必ず正しく返す
* internal API は認可必須（401/403）

---

## 1. API Routes 一覧

### 1.1 Public

| Route                                                         | 用途                                             |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `GET /api/places`                                             | 地図用の全店舗取得（軽量版）                                 |
| `GET /api/places/[id]`                                        | 個別店舗詳細（Drawer用）                                |
| `GET /api/stats`                                              | v3 コア統計                                        |
| `GET /api/filters/meta`                                       | UIフィルタ用メタデータ                                   |
| `GET /api/search`                                             | v2.1 予定の検索API                                  |
| `GET /api/history/[id]`                                       | v4 設計：店舗の推移データ取得（将来）                           |
| `POST /api/submissions`                                       | 申請（owner/community/report）送信（confirm画面でのみ最終送信） |
| `GET /api/media/submissions/[submissionId]/gallery/[mediaId]` | **公開可能**な申請画像（gallery）配信                       |

### 1.2 Internal（運営審査）

| Route                                                                 | 用途                                 |
| --------------------------------------------------------------------- | ---------------------------------- |
| `GET /api/internal/submissions`                                       | 申請一覧（pending/approved/rejected）    |
| `GET /api/internal/submissions/[id]`                                  | 申請詳細（payload + 添付画像）               |
| `POST /api/internal/submissions/[id]/approve`                         | 承認（status=approved + review_note等） |
| `POST /api/internal/submissions/[id]/reject`                          | 却下（status=rejected + reason等）      |
| `POST /api/internal/submissions/[id]/promote`                         | 掲載反映（owner/communityのみ）            |
| `GET /api/internal/media/submissions/[submissionId]/[kind]/[mediaId]` | **非公開**画像（proof/evidence）配信（認証必須）  |

> internal は必ず authn/authz を通す（未認証=401、権限なし=403）

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
  chains: Record<string, number> // BTC/LIGHTNING/ETH/USDT...
}
```

### 2.4 Filters Meta

```ts
type FiltersMeta = {
  categories: string[]
  chains: string[]
  countries: string[]
  cities: string[] | Record<string, string[]> // 実装都合でどちらでも可（UI側で吸収）
}
```

### 2.5 Submissions（申請）

#### DB `public.submissions`（概念）

```ts
type SubmissionKind = "owner" | "community" | "report"
type SubmissionStatus = "pending" | "approved" | "rejected"

type Submission = {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  place_id: string | null
  payload: Record<string, unknown>  // 正規化済み
  submitted_by: Record<string, unknown>
  reviewed_by: Record<string, unknown> | null
  review_note: string | null
  created_at: string
  updated_at: string
  level: "owner" | "community" | "unverified" // 運用固定（submissions.md参照）
}
```

#### `public.submission_media`

```ts
type SubmissionMediaKind = "gallery" | "proof" | "evidence"
type SubmissionMedia = {
  id: number
  submission_id: string
  kind: SubmissionMediaKind
  url: string            // アップロード後の永続URL（署名URL禁止）
  caption?: string | null
  source?: string | null
  created_at: string
}
```

---

## 3. GET `/api/places`（Map用）

### 3.1 Description

地図描画のための **軽量データのみ**返す。Drawer用の重いデータは返さない。

### 3.2 Query Parameters（all optional）

* `country`
* `city`
* `category`
* `chain`（複数可：`?chain=BTC&chain=ETH`）
* `verification`（複数可：owner/community/directory/unverified）
* `limit`（サーバ側上限に丸める）

### 3.3 Response（example）

```json
[
  {
    "id": "cpm:antarctica:owner-cafe-1",
    "name": "Antarctica Owner Café",
    "lat": -77.845,
    "lng": 166.667,
    "verification": "owner",
    "category": "cafe",
    "city": "McMurdo Station",
    "country": "AQ",
    "accepted": ["BTC", "BTC@Lightning", "ETH"]
  }
]
```

---

## 4. GET `/api/places/[id]`（Drawer用）

### 4.1 Description

Drawer（右側/Bottom sheet）の **完全詳細**を返す。

### 4.2 Response

* `PlaceDetail` 完全型

---

## 5. GET `/api/stats`（v3 核心統計）

### 5.1 Description

Stats v3 で必要な「コア統計」を返す。

### 5.2 Response（example）

```json
{
  "total_places": 1290,
  "countries": 84,
  "cities": 310,
  "categories": 22,
  "chains": {
    "BTC": 540,
    "LIGHTNING": 430,
    "ETH": 300,
    "USDT": 120
  }
}
```

---

## 6. GET `/api/filters/meta`

### 6.1 Description

UIのフィルタ（ドロップダウン等）表示のためのメタ情報。

### 6.2 Response

```json
{
  "categories": ["cafe","restaurant"],
  "chains": ["BTC","Lightning","ETH"],
  "countries": ["Japan","USA"],
  "cities": ["Tokyo","Osaka"]
}
```

---

## 7. GET `/api/search`（v2.1）

### 7.1 Description

簡易検索（名前/カテゴリ/都市など）の全文検索。

### 7.2 Query

* `q`（例：`?q=crypto`）

### 7.3 Response

```json
[
  { "id":"...", "name":"...", "city":"...", "country":"...", "verification":"owner" }
]
```

---

## 8. GET `/api/history/[id]`（v4 推移用 / 将来）

### 8.1 Response（example）

```json
{
  "id": "cpm:xxx",
  "history": [
    { "date": "2025-01-01", "value": 3 },
    { "date": "2025-02-01", "value": 4 }
  ]
}
```

---

## 9. POST `/api/submissions`（Submit：confirm画面でのみ最終送信）

### 9.1 Description

owner/community/report の申請を受け付ける。
**UIは入力→確認（Review）→最終送信**の2段。**最終送信は confirm 画面でのみ行う**。

### 9.2 Content-Type（固定）

* **`multipart/form-data`** を基本とする（画像を含むため）
* フィールド：

  * `payload`：JSON文字列（フォーム入力本体）
  * 画像ファイル（kindに応じて受理）

    * owner: `proof`(0..1) + `gallery`(0..8)
    * community: `gallery`(0..4)
    * report: `evidence`(0..4)

> 禁止：ユーザーが任意URLを入力して `submission_media.url` に入れる運用。
> `url` はサーバーがアップロード後に発行する。

### 9.3 Validation（必須）

共通：

* 画像形式：jpeg/png/webp
* 画像サイズ：≤ 2MB
* 枚数上限：kind別
* 必須項目/文字数上限（フォーム仕様に従う）
* honeypot（あれば）検知で 400

kind別（運用固定）：

* `kind=owner` → `submissions.level=owner` 固定
* `kind=community` → `submissions.level=community` 固定
* `kind=report` → `submissions.level=unverified` 固定

### 9.4 Success Responses

#### 200/201（DB保存OK）

```json
{
  "submissionId": "uuid",
  "status": "pending",
  "accepted": true
}
```

#### 202（DB障害 / 保留受理）

* `data/submissions-pending.ndjson` に payload を保留し、**受理扱い**で返す

```json
{
  "submissionId": "uuid",
  "status": "pending",
  "accepted": true,
  "degraded": true
}
```

### 9.5 Error Responses

* 400：INVALID_INPUT / HONEYPOT / UNSUPPORTED_KIND / FILE_TOO_LARGE / FILE_TYPE_NOT_ALLOWED / TOO_MANY_FILES
* 429：RATE_LIMIT
* 500：INTERNAL

例：

```json
{
  "error": { "code":"INVALID_INPUT", "message":"gallery images exceed limit", "details": { "limit": 4 } }
}
```

---

## 10. Media APIs（申請添付画像の配信）

### 10.1 Public gallery（公開可）

#### `GET /api/media/submissions/[submissionId]/gallery/[mediaId]`

* 対象：`submission_media.kind=gallery`
* 認証：不要（公開閲覧）
* Cache：可（CDNキャッシュ/ブラウザキャッシュOK）
* 404：存在しない、または gallery ではない

### 10.2 Internal proof/evidence（非公開）

#### `GET /api/internal/media/submissions/[submissionId]/[kind]/[mediaId]`

* 対象：`kind in (proof, evidence)`
* 認証：必須（運営のみ）
* Cache：禁止（`Cache-Control: no-store`）
* 403：権限なし
* 404：存在しない、または kind 不一致

> `submission_media.url` には署名URLを保存しない。
> DBには上記の **アプリ配信エンドポイントURL** を永続URLとして保存する。

---

## 11. Internal Submissions APIs（運営審査）

### 11.1 `GET /api/internal/submissions`

* Query：

  * `status=pending|approved|rejected`（省略時 pending）
  * `kind=owner|community|report`（任意）
  * `limit`, `cursor`（任意）
* Response：最小一覧（id, kind, status, created_at, place_id, payload要約）
* 401/403：認証/権限

### 11.2 `GET /api/internal/submissions/[id]`

* Response：Submission + `submission_media[]`（kind別で並べ替えて良い）
* 401/403：認証/権限

### 11.3 `POST /api/internal/submissions/[id]/approve`

* Body（JSON）：

  * `review_note`（任意）
* Side effects：

  * `status=approved`
  * `approved_at` 等の整合を取る（DB側仕様に従う）
* Response：更新後の submission

### 11.4 `POST /api/internal/submissions/[id]/reject`

* Body（JSON）：

  * `reject_reason`（推奨）
  * `review_note`（任意）
* Side effects：

  * `status=rejected`
  * `rejected_at` 等の整合を取る
* Response：更新後の submission

### 11.5 `POST /api/internal/submissions/[id]/promote`（owner/communityのみ）

* Preconditions：

  * submission.kind in (owner, community)
  * submission.status == approved
* Side effects（概念）：

  * places を新規作成 or 更新
  * place の公開mediaへ `gallery` を反映（proof/evidenceは絶対に公開しない）
  * payment_accepts / socials 等の正規化反映
* Error：

  * 409：not approved / wrong kind
  * 400：payload不足
  * 500：反映失敗
* Response：

  * `{ placeId, promoted: true }` など

---

## 12. Completion Checklist（API完成条件）

### Core

* [ ] `/api/places` 200 / フィルタ動作 / 軽量返却
* [ ] `/api/places/[id]` Drawer 全項目が取得できる
* [ ] `/api/stats` v3 core と一致
* [ ] `/api/filters/meta` 揺れなし
* [ ] `/api/search` 部分一致
* [ ] `/api/history/[id]`（将来）最低限レスポンス

### Submissions

* [ ] `/api/submissions` が multipart で受け取れる
* [ ] kind別枚数上限/2MB/形式チェックが UI+API 両方で効く
* [ ] 200/201/202 のUI分岐が可能なレスポンスを返す
* [ ] DB障害でも `submissions-pending.ndjson` に落ちて 202 を返す
* [ ] `submission_media.url` は永続URL（署名URL禁止）
* [ ] public gallery と internal proof/evidence の配信が分離されている
* [ ] internal approve/reject/promote が動作する（reportにpromoteなし）


```
