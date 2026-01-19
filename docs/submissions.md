# Submissions — CryptoPayMap v2 (Authoritative)

この文書は **Submit（申請）と審査・反映（internal）** に関する唯一の正本。

---

## 0. スコープ宣言（固定）

- **申請（Submission.kind）は `owner` / `community` / `report` のみ。**
- **`unverified` / `directory` は「Placeの状態（データ出自/品質）」であり、申請ではない。**
- 画像は **placeレベル（unverified等）とは無関係**。画像は **Submissionにだけ紐づく**。
- DBには互換/実装都合で `submissions.level` が存在するが、**これを Place状態と混同しない**（下の「levelの意味」を参照）。

---

## 1. 目的

- Owner/Community の申請を受け付け、内部審査で承認したものだけを掲載に反映する。
- Report は「掲載の追加」ではなく、既存掲載の問題報告（誤情報/詐欺/閉店/不正）として扱う。
- DB不調でも申請を受け付け、**保留（NDJSON）** に落として後で回収できるようにする。

---

## 2. 用語

- **Submission**: ユーザーからの入力（owner/community/report）を「審査対象」として保存したもの。
- **Place**: 地図上の掲載データ（OSM/インポート/手動/審査反映で作成・更新される）。
- **Verification**: placeに対して付く検証結果/検証レベル（owner/community等）。Submissionとは別概念。
- **Media**:
  - `submission_media`: 申請に添付された画像/証拠
  - `media`: placeに紐づく公開用画像（カバー/ギャラリー）

---

## 3. データモデル（DB正本：現状の実体）

### 3.1 `public.submissions`

| column | type | meaning (policy) |
|---|---|---|
| id | text | submission id（UUID文字列想定） |
| kind | text | `owner` / `community` / `report`（CHECKあり） |
| status | text | `pending` / `approved` / `rejected`（CHECKあり, default pending） |
| place_id | text nullable | 既存placeに対する申請/報告の場合に入る（新規の場合はnull可） |
| payload | jsonb | フォーム入力の本体（正規化済み） |
| submitted_by | jsonb | Submitter情報（最小限） |
| reviewed_by | jsonb | 審査者情報（internalのみ） |
| review_note | text nullable | 審査メモ（internalのみ） |
| created_at | timestamptz |  |
| updated_at | timestamptz |  |
| level | text | **重要：Place状態ではない**。この列は互換の残骸。下の「levelの意味」で運用を固定する。 |

#### `submissions.level` の意味（ここで固定）
- **policy**: `level` は「申請が目指す検証ターゲット」＝ `requested_verification_level` としてのみ使う。
- `kind=owner`  → `level=owner` 固定  
- `kind=community` → `level=community` 固定  
- `kind=report` → `level=unverified` 固定（= *reportは検証申請ではない* を明示するためのダミー値）  
- **禁止**: `kind in (owner,community)` なのに `level in (unverified,directory)` を入れるのは禁止（APIで拒否）。

> 将来の整理：`level` を `requested_level` にrenameする or reportではnull化する（別フェーズで実施）。  
> ただし今は **仕様で運用を固定**して混乱を止める。

---

### 3.2 `public.submission_media`

| column | type | policy |
|---|---|---|
| id | bigserial |  |
| submission_id | text | submissions(id) 参照 |
| kind | text | `gallery` / `proof` / `evidence`（CHECKあり） |
| url | text | 画像URL（アップロード後の永続URL） |
| caption | text nullable | 任意 |
| source | text nullable | 任意 |
| created_at | timestamptz |  |

#### 添付画像の運用ルール（固定）
- `kind=gallery` : 店舗紹介/雰囲気写真（公開反映されうる）
- `kind=proof` : **Ownerのみ**。所有/運営の証拠（公開しない）
- `kind=evidence` : **Reportのみ**。問題の証拠（公開しない or 状況により公開）

---

### 3.3 `public.verifications`（重要：Submissionと別）

- verifications は placeに付く検証情報。
- default status は **pending**（危険な approved デフォルトは禁止）。

> ここは `docs/db.md` 側にも同じ内容があるはず。重複はこの正本に寄せる。

---

## 4. フォーム仕様（UI制限は“必要な箇所だけ”）

### 4.1 共通（全フォーム）
- 画像の許可形式：`image/jpeg,image/png,image/webp`
- 画像サイズ：**≤ 2MB**（UI＋サーバーでチェック）
- SubmitterName：min 2 / max 80（UI制限）
- 送信前のクライアントバリデーション：必須項目、文字数、画像枚数、honeypot

---

### 4.2 Owner 申請（`kind=owner`）
**主な上限制約（現状フォームから確定）**
- About: **≤600**
- PaymentNote: **≤150**
- amenities_notes: **≤150**
- CategoryOther: **≤100**
- Gallery: **最大 8枚**
- ProofImage: **単独 1枚**（`kind=proof` として保存する）

**保存ポリシー**
- `submissions.kind=owner`
- `submissions.level=owner`
- `submission_media`:
  - `proof` : 0..1
  - `gallery`: 0..8

---

### 4.3 Community 申請（`kind=community`）
**上限制約（確定）**
- About: **≤300**
- PaymentNote: **≤150**
- amenities_notes: **≤150**
- Address: max 200（UI制限）
- BusinessName: max 80（UI制限）
- Gallery: **最大 4枚**

**保存ポリシー**
- `submissions.kind=community`
- `submissions.level=community`
- `submission_media.gallery`: 0..4

---

### 4.4 Report（問題報告 `kind=report`）
**上限制約（確定）**
- PlaceName: max 80（UI制限）
- Evidence images: **最大 4枚**（フォーム上 “gallery up to 4” と表示。DBでは `kind=evidence` に統一して保存する）

**保存ポリシー**
- `submissions.kind=report`
- `submissions.level=unverified`（=reportは検証申請ではない）
- `submission_media.evidence`: 0..4
- report は原則、**既存placeに紐づく**（`place_id` が取れる場合は必ず入れる）
  - deep link/内部UIから report を出す場合は place_id 必須にする（将来）

---

## 5. API仕様（/api/submissions）

### 5.1 エンドポイント
- `POST /api/submissions` （統合）
- 互換：`POST /api/submissions/owner`, `/community` は legacy（内部で統合に流す）

### 5.2 受理/拒否
- **429**: rate limit
- **400**: invalid（schema/required）または honeypot
- **200/201**: 通常受理（DB保存OK）
- **202**: DB障害 → NDJSON保留に保存して受理扱い（accepted=true）

### 5.3 DB障害時の保留（確定）
- 保留ファイル：`data/submissions-pending.ndjson`
- レコード：`submissionId, receivedAt, payload, error`
- 返却：`{ submissionId, status:"pending", accepted:true }`

---

## 6. Internal 審査（/internal/* と /api/internal/*）

### 6.1 Internal の基本フロー
1. Pending一覧を取得
2. 詳細を見て判断
3. `approve` または `reject`
4. `promote`（掲載反映）※ owner/community のみ

### 6.2 審査状態の意味（submissions.status）
- `pending`: 未処理
- `approved`: 承認（まだ反映前）
- `rejected`: 却下
- `promote`: **DB列ではない**（操作）。promoteの結果は places 等に反映される

### 6.3 Promote 反映先（確定）
- `places`：新規作成または更新
- `media`：公開用の cover/gallery（submission_media.gallery のうち採用分のみ）
- `payment_accepts` / `payments` / `socials`：payload から正規化して反映

> proof/evidence は **public media に出さない**（内部証跡）。

---

## 7. 「unverified/directory」について（混同を止める）

- **OSM/インポート由来の Place が unverified**（=Place状態）
- **申請は owner/community/report のみ**（=Submission.kind）
- **画像は Submissionにのみ紐づく**（Place状態とは独立）
- Placeの検証状態は `verifications`（または place flags）で管理し、Submissionに持ち込まない。

---

## 8. 実装チェックリスト（改修時に必ず見る）

### 8.1 Submit（owner/community/report）
- [ ] kind/required が APIで弾ける
- [ ] `kind=owner` → `level=owner` 固定
- [ ] `kind=community` → `level=community` 固定
- [ ] `kind=report` → `level=unverified` 固定
- [ ] gallery/proof/evidence の枚数制限が両側（UI+API）で効く
- [ ] 画像2MB/形式制限が効く
- [ ] DB落ちたら 202 + NDJSON で受理される

### 8.2 Internal
- [ ] pending一覧が取得できる
- [ ] approve/reject が status を更新する
- [ ] promote が places 等へ反映する（proof/evidence は公開しない）

---

## 9. Decision Log（この文書でのみ更新）

- YYYY-MM-DD: submissions.level は requested_verification_level として運用固定（reportはunverified固定）
- YYYY-MM-DD: report の画像は submission_media.kind=evidence に統一
- YYYY-MM-DD: proof/evidence は公開に出さない
