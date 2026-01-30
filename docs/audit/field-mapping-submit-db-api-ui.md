# [CHK-03] Submit入力項目 ↔ DB項目 ↔ APIレスポンス ↔ Map/Drawer表示 整合表

目的: 「submitで集めた情報がDBに入り、APIで返り、Drawerで表示される」までの対応関係を固定し、**どこで落ちると“仕様未達”になるか**を追跡できるようにする。

> 参照元: 現行 Submit 実装 (`components/submit/*`), API (`app/api/places/*`), DB仕様 (`docs/submissions.md`, `docs/db.md`), Drawer 実装 (`components/map/*`)。

---

## 1) Submit form fields → submissions テーブル（payload / submitted_by）

### 1.1 共通（owner/community/report）
| Submit UI (draft key) | POST payload key | submissions column | どこで落ちると仕様未達になるか / 備考 |
|---|---|---|---|
| `kind` | `kind` / `verificationRequest` | `submissions.kind` / `submissions.level` | `kind` が未設定 or `level` に反映されない場合は **種別不整合**。（`level` は `kind` 由来で固定）【F:components/submit/types.ts†L4-L18】【F:components/submit/types.ts†L21-L30】【F:components/submit/payload.ts†L19-L51】【F:lib/submissions.ts†L12-L20】【F:lib/submissions.ts†L211-L219】 |
| `submitterName` | `contactName` | `submissions.payload` + `submissions.submitted_by.name` | payload に入らない/`submitted_by` に入らない場合、**申請者情報が失われる**。【F:components/submit/types.ts†L19-L20】【F:components/submit/types.ts†L33-L34】【F:components/submit/payload.ts†L21-L23】【F:components/submit/payload.ts†L45-L47】【F:lib/submissions.ts†L23-L30】【F:lib/submissions.ts†L245-L255】【F:docs/submissions.md†L107-L114】 |
| `submitterEmail` | `contactEmail` | `submissions.payload` + `submissions.submitted_by.email` | payload/`submitted_by` のどちらにも入らない場合、**連絡手段が失われる**。【F:components/submit/types.ts†L19-L20】【F:components/submit/types.ts†L33-L34】【F:components/submit/payload.ts†L21-L23】【F:components/submit/payload.ts†L45-L47】【F:lib/submissions.ts†L245-L255】【F:docs/submissions.md†L107-L114】 |
| `placeId` | `placeId` | `submissions.place_id` + `submissions.payload` | 既存placeへの申請/報告が **紐付かない**。【F:components/submit/types.ts†L17-L18】【F:components/submit/types.ts†L24-L30】【F:components/submit/payload.ts†L27-L31】【F:components/submit/payload.ts†L48-L50】【F:docs/submissions.md†L155-L167】 |
| `placeName` | `placeName` | `submissions.payload` | placeIdが無い場合の識別用。payload へ入らないと **内部審査時の識別が困難**。【F:components/submit/types.ts†L17-L18】【F:components/submit/types.ts†L24-L30】【F:components/submit/payload.ts†L27-L31】【F:components/submit/payload.ts†L48-L50】【F:docs/submissions.md†L155-L167】 |

### 1.2 Owner / Community
| Submit UI (draft key) | POST payload key | submissions column | どこで落ちると仕様未達になるか / 備考 |
|---|---|---|---|
| `name` | `name` | `submissions.payload` | place名の本体。payload に入らないと **place生成が不可能**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `country` | `country` | `submissions.payload` | place生成/検索で欠落。payload から落ちると **suggested ID生成に影響**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】【F:lib/submissions.ts†L161-L175】 |
| `city` | `city` | `submissions.payload` | 同上。city 欠落は **place ID 生成に影響**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】【F:lib/submissions.ts†L161-L175】 |
| `address` | `address` | `submissions.payload` | place詳細に反映されない場合、**住所表示が空**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `category` | `category` | `submissions.payload` | category 欠落は **Map/Drawerのカテゴリ表示が空**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `acceptedChains` | `acceptedChains` | `submissions.payload` | 支払い受入情報が落ちると **Map/Drawerの支払い表示が空**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `about` | `about` | `submissions.payload` | place description の元情報が欠落。**Drawer説明が空**になりうる。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `paymentNote` | `paymentNote` | `submissions.payload` | **payment note の表示元**。payload から落ちると UI に出ない。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `website` | `website` | `submissions.payload` | socials/links の元情報。payload 欠落で **リンクが表示されない**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `twitter` | `twitter` | `submissions.payload` | 同上（SNSリンク）。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `instagram` | `instagram` | `submissions.payload` | 同上（SNSリンク）。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `facebook` | `facebook` | `submissions.payload` | 同上（SNSリンク）。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L33-L51】 |
| `lat` / `lng` | `lat` / `lng` | `submissions.payload` | place 生成時に必須（`submissionToPlace` で検証）。欠落すると **place化で失敗**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L41-L44】【F:lib/submission-to-place.ts†L44-L69】 |
| `role` | `role` | `submissions.payload` | internal 審査用の補助情報。payload 欠落で **審査コンテキストが消える**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L45-L47】 |
| `notesForAdmin` | `notesForAdmin` | `submissions.payload` | internal 審査用メモ。payload 欠落で **審査補足が消える**。【F:components/submit/types.ts†L6-L18】【F:components/submit/payload.ts†L46-L47】 |

### 1.3 Report
| Submit UI (draft key) | POST payload key | submissions column | どこで落ちると仕様未達になるか / 備考 |
|---|---|---|---|
| `placeName` | `placeName` / `name` | `submissions.payload` | report対象識別ができない。payload 欠落で **審査不能**。【F:components/submit/types.ts†L21-L30】【F:components/submit/payload.ts†L12-L28】 |
| `reportReason` | `reportReason` | `submissions.payload` | **報告理由が失われる**（reportの主旨が欠落）。【F:components/submit/types.ts†L21-L30】【F:components/submit/payload.ts†L18-L24】 |
| `reportDetails` | `reportDetails` | `submissions.payload` | 詳細が失われる（補足が消える）。【F:components/submit/types.ts†L21-L30】【F:components/submit/payload.ts†L18-L24】 |

> **補足 (仕様未達の監視ポイント)**: `amenities` / `amenitiesNotes` / `communityEvidenceUrls` / `ownerVerification` / `reportAction` などは仕様上の必須項目だが、現行 Submit Draft/Payload に存在しないため **submit → DB で落ちる**。追加が必要な場合は Draft 型と payload 生成を更新すること。【F:components/submit/types.ts†L4-L48】【F:components/submit/payload.ts†L12-L51】【F:docs/submissions.md†L290-L366】

---

## 2) Media fields → submission_media table + R2 key scheme

| Submit media field | submission_media.kind | submission_media columns | R2 key scheme / URL | どこで落ちると仕様未達になるか / 備考 |
|---|---|---|---|---|
| `gallery[]` | `gallery` | `submission_id`, `kind`, `url` | `submissions/{submissionId}/{kind}/{mediaId}.webp` → `submission_media.url` に保存。【F:lib/storage/r2.ts†L52-L57】【F:lib/db/media.ts†L43-L63】 | `submission_media` insert が失敗 or R2 key が規約と違うと **公開ギャラリーが表示不可**。【F:docs/submissions.md†L193-L206】【F:docs/submissions.md†L359-L388】 |
| `proof[]` | `proof` | `submission_id`, `kind`, `url` | `submissions/{submissionId}/{kind}/{mediaId}.webp` → internal配信用URLを保存。【F:lib/storage/r2.ts†L52-L57】【F:lib/db/media.ts†L43-L63】 | proof が `gallery` で保存されると **公開漏洩リスク**。internal URL でない場合は仕様違反。【F:docs/submissions.md†L193-L206】【F:docs/submissions.md†L359-L392】 |
| `evidence[]` | `evidence` | `submission_id`, `kind`, `url` | `submissions/{submissionId}/{kind}/{mediaId}.webp` → internal配信用URLを保存。【F:lib/storage/r2.ts†L52-L57】【F:lib/db/media.ts†L43-L63】 | evidence が `gallery` で保存されると **公開漏洩リスク**。internal URL でない場合は仕様違反。【F:docs/submissions.md†L193-L206】【F:docs/submissions.md†L359-L392】 |

---

## 3) Place fields（amenities/paymentNote 等）→ places DB → /api/places response → Drawer 表示

> 対象 UI: `components/map/Drawer.tsx`（Desktop）と `components/map/MobileBottomSheet.tsx`（Mobile）。

| Place field (intent) | DB source | /api/places response | Drawer / BottomSheet 表示 | どこで落ちると仕様未達になるか / 備考 |
|---|---|---|---|---|
| `name` | `places.name` | `/api/places` & `/api/places/:id` → `name` | Drawer title | `name` 欠落で **タイトル空**。【F:docs/db.md†L35-L53】【F:app/api/places/route.ts†L87-L111】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/Drawer.tsx†L166-L187】 |
| `category` | `places.category` | `/api/places` & `/api/places/:id` → `category` | Drawer badge meta | 欠落で **カテゴリ表示なし**。【F:docs/db.md†L35-L53】【F:app/api/places/route.ts†L87-L111】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/Drawer.tsx†L166-L189】 |
| `verification` | `verifications.level`（or default） | `/api/places` & `/api/places/:id` → `verification` | Drawer badge / color | 不整合は **検証ラベル誤表示**。【F:app/api/places/route.ts†L20-L28】【F:app/api/places/[id]/route.ts†L16-L35】【F:components/map/Drawer.tsx†L18-L38】【F:components/map/Drawer.tsx†L165-L186】 |
| `lat` / `lng` | `places.lat` / `places.lng` | `/api/places` & `/api/places/:id` → `lat` / `lng` | Map navigationリンク / marker | 欠落で **地図遷移/ナビが機能しない**。【F:docs/db.md†L40-L53】【F:app/api/places/route.ts†L87-L111】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/Drawer.tsx†L74-L88】 |
| `country` / `city` | `places.country` / `places.city` | `/api/places` & `/api/places/:id` → `country` / `city` | Drawer meta (short address) | 欠落で **所在地表示が空**。【F:docs/db.md†L35-L53】【F:app/api/places/route.ts†L87-L111】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/Drawer.tsx†L158-L189】 |
| `address_full` | `places.address` | `/api/places/:id` → `address_full` | Drawer Address section | 欠落で **住所表示が空**。【F:docs/db.md†L35-L53】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/Drawer.tsx†L191-L199】【F:components/map/Drawer.tsx†L277-L287】 |
| `about` / `description` | `places.about` | `/api/places/:id` → `about` | Drawer Description section | `about` 欠落で **説明が表示されない**。【F:docs/db.md†L49-L53】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/Drawer.tsx†L205-L212】 |
| `amenities[]` | `places.amenities` | `/api/places/:id` → `amenities` | **MobileBottomSheetのみ** Amenities section | DBに未保存 or APIで正規化失敗すると **アメニティ表示が空**。【F:docs/db.md†L49-L53】【F:app/api/places/[id]/route.ts†L41-L70】【F:app/api/places/[id]/route.ts†L256-L288】【F:components/map/MobileBottomSheet.tsx†L147-L155】【F:components/map/MobileBottomSheet.tsx†L362-L379】 |
| `paymentNote` | **DBに列が存在しない** | `/api/places/:id` に含まれない | **MobileBottomSheetのみ** Payment note section | **DB/APIに載らないため仕様未達**（`submissionToPlace` 経由の in-memory では保持されるが DB反映なし）。【F:docs/db.md†L35-L53】【F:app/api/places/[id]/route.ts†L256-L292】【F:lib/submission-to-place.ts†L84-L110】【F:components/map/MobileBottomSheet.tsx†L147-L155】【F:components/map/MobileBottomSheet.tsx†L332-L350】 |
| `accepted` / `supported_crypto` | `payment_accepts` | `/api/places` & `/api/places/:id` → `accepted` / `payments.assets` | Drawer Supported crypto | `payment_accepts` が未反映だと **支払い表示が空**。【F:docs/db.md†L72-L86】【F:app/api/places/route.ts†L100-L120】【F:app/api/places/[id]/route.ts†L214-L288】【F:components/map/Drawer.tsx†L91-L117】【F:components/map/Drawer.tsx†L203-L221】 |
| `images` / `media` | `media.url` | `/api/places/:id` → `images` / `media` | Drawer Photos | `media` 未登録だと **写真表示が空**。【F:docs/db.md†L108-L118】【F:app/api/places/[id]/route.ts†L111-L134】【F:app/api/places/[id]/route.ts†L231-L288】【F:components/map/Drawer.tsx†L189-L203】 |
| `socials` / `contact` | `socials` | `/api/places/:id` → `socials` / `contact` | Drawer Links | `socials` が無いと **リンクが表示されない**。【F:docs/db.md†L88-L100】【F:app/api/places/[id]/route.ts†L90-L146】【F:app/api/places/[id]/route.ts†L231-L288】【F:components/map/Drawer.tsx†L40-L72】【F:components/map/Drawer.tsx†L214-L242】 |
| `submitterName` | **placesテーブルに列なし** | `/api/places/:id` に含まれない | **MobileBottomSheetのみ** Submitted by | **DB/APIに載らないため仕様未達**（fallback data/`submissionToPlace` のみ保持）。【F:docs/db.md†L35-L53】【F:app/api/places/[id]/route.ts†L256-L292】【F:lib/submission-to-place.ts†L84-L110】【F:components/map/MobileBottomSheet.tsx†L147-L155】【F:components/map/MobileBottomSheet.tsx†L390-L399】 |

---

## 監査で見るべき「落ちる箇所」まとめ

- **Submit → submissions**: Draft/Payload に存在しない項目は **DBに到達しない**。特に `amenities` / `amenitiesNotes` / `ownerVerification` / `communityEvidenceUrls` / `reportAction` は仕様必須だが現状欠落。【F:components/submit/types.ts†L4-L48】【F:components/submit/payload.ts†L12-L51】【F:docs/submissions.md†L290-L366】
- **submissions → places**: `submissionToPlace` で扱うフィールドは **DB schema に列がないと落ちる**（例: `paymentNote`, `submitterName`）。【F:lib/submission-to-place.ts†L84-L110】【F:docs/db.md†L35-L53】
- **places → /api/places → Drawer**: `/api/places/:id` のレスポンスに含まれない項目は **Drawer に表示されない**（例: payment note / submitterName）。【F:app/api/places/[id]/route.ts†L256-L292】【F:components/map/MobileBottomSheet.tsx†L147-L155】【F:components/map/MobileBottomSheet.tsx†L332-L399】
