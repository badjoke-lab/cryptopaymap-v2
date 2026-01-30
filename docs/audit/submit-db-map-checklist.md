# [CHK-01] submit/DB/map表示 チェックリスト（改ざん防止の監査基準）

> 目的: **docs から要件を機械的に抜き出し**、実装/レビューの合否判定をこのチェック項目に固定する。以後の判断は本チェックリストのみを根拠に行う。  
> 参照元: [docs/submissions.md](../submissions.md) / [docs/ui.md](../ui.md) / [docs/api.md](../api.md) / [docs/db.md](../db.md) / [docs/media-storage.md](../media-storage.md)

---

## A. Submit ルート & 画面遷移（/submit/{kind}/confirm/done）

**参照:** [docs/submissions.md](../submissions.md) / [docs/ui.md](../ui.md)

- [ ] ルート遷移が **`/submit` → `/submit/{kind}` → `/submit/{kind}/confirm` → `/submit/done`** になっている。
- [ ] **最終 POST は confirm 画面でのみ**行われる（入力画面は送信しない）。
- [ ] `kind` は **`owner` / `community` / `report`** のみ。

---

## B. kind / 希望ステータス / 必須入力

**参照:** [docs/submissions.md](../submissions.md) / [docs/ui.md](../ui.md)

### B-1. 共通必須
- [ ] 希望ステータス表示が必須（`owner`→Owner Verified / `community`→Community Verified / `report`→Report）。
- [ ] submitter: `submitterName` / `submitterEmail` が必須。
- [ ] place: `placeName` が必須（`country`/`city`/`address`/`lat`/`lng` は任意だが入力欄あり）。

### B-2. Owner（`kind=owner`）
- [ ] 希望ステータスは **Owner Verified（固定表示）**。
- [ ] 本人確認（いずれか必須）:
  - [ ] `ownerVerification.method` が `domain` / `work_email` / `dashboard_ss` のいずれか。
  - [ ] `method=domain` の場合 `ownerVerification.domain` 必須。
  - [ ] `method=work_email` の場合 `ownerVerification.workEmail` 必須。
  - [ ] `method=dashboard_ss` の場合 **証拠画像 `proof` 必須**。
- [ ] 決済証拠は **必須**（`ownerPayment.paymentUrl` か `proof` 画像のいずれか）。

### B-3. Community（`kind=community`）
- [ ] 希望ステータスは **Community Verified（固定表示）**。
- [ ] **独立した証拠URLが2本以上**（`communityEvidenceUrls[]` min:2）。

### B-4. Report（`kind=report`）
- [ ] 希望ステータスは **Report（Takedown/修正）**。
- [ ] `reportWrongWhat` が必須。
- [ ] `reportEvidenceUrls[]` が **min:1**。
- [ ] `reportAction` が **`hide` / `fix`** のいずれか必須。

---

## C. 証拠URLの本数 / 独立性

**参照:** [docs/submissions.md](../submissions.md) / [docs/ui.md](../ui.md)

- [ ] Community: **`communityEvidenceUrls[]` は 2 本以上**。
- [ ] Community: **独立性の説明**が UI 上で明示されている（同一サイトの言い換え不可・相互依存不可）。
- [ ] Report: **`reportEvidenceUrls[]` は 1 本以上**。

---

## D. 添付（proof / gallery / evidence）の要件と公開範囲

**参照:** [docs/submissions.md](../submissions.md) / [docs/ui.md](../ui.md) / [docs/media-storage.md](../media-storage.md)

### D-1. 添付種別と枚数
- [ ] Owner: `proof` 画像 **1〜4枚**、`gallery` 0〜8枚。
- [ ] Community: **`proof` は存在しない**、`gallery` 0〜4枚。
- [ ] Report: `evidence` 0〜4枚（DB保存は `submission_media.kind=evidence` に統一）。

### D-2. 公開範囲（public / internal）
- [ ] `gallery` は公開可（地図詳細で表示してよい）。
- [ ] `proof` / `evidence` は **internal 専用**（公開禁止）。
- [ ] `submission_media.url` は **永続 URL**であり、**R2 直 URL や期限付き URL を表示しない**。
- [ ] public / internal の配信エンドポイントが分離されている:
  - [ ] public: `/api/media/submissions/{submissionId}/gallery/{mediaId}`
  - [ ] internal: `/api/internal/media/submissions/{submissionId}/{kind}/{mediaId}`

---

## E. place（DB / API）に存在すべき項目

**参照:** [docs/db.md](../db.md) / [docs/api.md](../api.md)

- [ ] places（DB）に **`name` / `address` / `city` / `country` / `category` / `lat` / `lng` / `hours` / `about` / `amenities`** が存在する。  
- [ ] PlaceDetail（API）に **`amenities`** が存在する。
- [ ] PlaceDetail（API）に **`payments`**（`assets` / `pages`）が存在する。
- [ ] PlaceDetail（API）に **`contact`**（`website`/`phone`/`x`/`instagram`/`facebook`）が存在する。
- [ ] PlaceDetail（API）に **`media`**（公開写真 URL）と `location`（`address1`/`address2`/`lat`/`lng`）が存在する。
- [ ] **`payment_note`**（payment note）は UI 仕様上の表示対象であるため、DB/API いずれかに保持・取得可能であること（場所は実装に依存するが、**欠落は禁止**）。

---

## F. Map / Drawer に表示すべき項目（UI 仕様一致）

**参照:** [docs/ui.md](../ui.md) / [docs/api.md](../api.md)

### F-1. Map（/map）
- [ ] `PlaceLite` の **`id` / `name` / `lat` / `lng` / `verification` / `category` / `city` / `country` / `accepted[]`** が表示データとして取得される。
- [ ] verification に応じたピン色・状態（active）が UI 仕様に一致する。

### F-2. Drawer 構造（共通）
- [ ] Drawer には **店名 / verification badge / category + 住所 / accepted** が表示される。
- [ ] **Photos** は owner / community のみ（directory / unverified は表示禁止）。
- [ ] **Description** は unverified では表示禁止。
- [ ] Website / SNS / Payment Note / Amenities / Submitter Info が存在する場合に表示される。

### F-3. Mobile Drawer
- [ ] Preview（約35%）に **店名 / verification badge / category + 住所 / accepted** が表示される。
- [ ] Preview では **写真・説明・Web/SNS を出さない**。
- [ ] Full Detail（約88%）は verification ルールに従い全項目を表示する。

---

## G. DB/API/Submit の整合チェック（監査）

**参照:** [docs/submissions.md](../submissions.md) / [docs/api.md](../api.md) / [docs/db.md](../db.md)

- [ ] `submissions.kind` は `owner/community/report` に固定。
- [ ] `submissions.level` は `kind` と **固定対応**（owner→owner / community→community / report→unverified）。
- [ ] 添付画像は **`submission_media` に保存**され、Place の `media` とは混同されない。

---

## H. 判定ルール（合否判定）

- **合格:** A〜G がすべて満たされる。
- **不合格:** 1項目でも欠けたら NG（修正必須）。

