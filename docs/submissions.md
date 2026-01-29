# 申請（Submissions）仕様 — CryptoPayMap v2（正本）

この文書は **Submit（申請）と審査・反映（internal）** に関する唯一の正本。  
（※Submit UI/UX・API・画像保存/URL発行・internal審査フローまで含む）

---

## 0. スコープ宣言（固定）

- **申請（Submission.kind）は `owner` / `community` / `report` のみ。**
- **`unverified` / `directory` は「Placeの状態（データ出自/品質）」であり、申請ではない。**
- 画像は **placeレベル（unverified等）とは無関係**。画像は **Submissionにだけ紐づく**。
- DBには互換/実装都合で `submissions.level` が存在するが、**これを Place状態と混同しない**（下の「levelの意味」を参照）。

---

## 0.1 Submit（申請）UI要件（必須・改ざん禁止）

この節は **「Submit UIは何を必須にしなければならないか」** を明文化した固定仕様。  
（※ここが抜けると実装者が勝手に簡略化しやすく、仕様改ざん・背信の温床になるため、明示して固定する）

### 0.1.1 画面遷移（固定）

- `/submit` → `/submit/{kind}` → `/submit/{kind}/confirm` → `/submit/done`
- **最終POSTは `confirm` でのみ行う**（`/submit/{kind}` は入力だけ。送信はしない）
- `kind` は `owner` / `community` / `report` のみ

### 0.1.2 共通必須（全 kind 共通）

- **希望ステータス**（UIに必ず表示）
  - `owner` → 「Owner Verified」
  - `community` → 「Community Verified」
  - `report` → 「Report（Takedown/修正）」  
  ※ユーザーが変更する必要はないが、**「何として申請しているか」を明示するため必須表示**にする。
- 申請者情報：`submitterName`（必須）、`submitterEmail`（必須）
- 店舗基本：`placeName`（必須）、`country/city/address`（任意だが推奨）、`lat/lng`（任意、地図ピン指定時に入る）
- 画像アップロード（任意/必須は kind で変わる）：アップロードされた画像は `submission_media` に保存し、**R2直URLは表示しない**（下の 0.1.5 参照）

### 0.1.3 Owner Verified（owner）必須入力

**目的**：申請者が「その店舗（事業者）の当事者」であることを示す。

必須（UIで欠落禁止）：

- 希望ステータス：**Owner Verified**（固定表示）
- 本人確認（いずれか1つ必須：選択式）
  1) **ドメイン認証**（例：公式ドメインの管理権限を示す）
     - 入力：`ownerVerification.domain`（必須）
     - 証拠：`proof` 画像（必須）  
       ※MVPでは自動DNS検証を必須にしない。代替として「ドメイン管理画面/公式サイト管理画面のスクショ」を提出させ、内部審査で確認する。
  2) **社用メール（OTP/受信証明）**
     - 入力：`ownerVerification.workEmail`（必須）
     - 証拠：`proof` 画像（必須）  
       ※将来はOTP送信を実装できるが、MVPでは「社用メールの受信箱スクショ等」で代替可。データ項目は将来OTPに置換しても互換を維持する。
  3) **ダッシュボードSS**（決済/予約/管理画面など）
     - 証拠：`proof` 画像（必須）

- 決済証拠（いずれか必須）
  - `ownerPayment.paymentUrl`（URL）**または**
  - `proof` 画像（決済画面スクショ）  
  ※決済がない業態は、予約/注文/会員など「実在の取引導線」を示すURL/スクショで代替可（内部審査で判断）。

推奨（任意だがUIに出してよい）：

- `payment_note`（支払いメモ：例「USDT可/Lightning可」など）
- `amenities[]` / `amenities_notes`（アメニティ・補足）
- `links[]`（公式サイト/メニュー/予約など）

添付（画像）：

- `gallery`：店舗写真（任意）
- `proof`：本人確認/決済証拠（**上記で必須**）

### 0.1.4 Community Verified（community）必須入力

**目的**：コミュニティが「その店舗が本当に受け入れている」ことを独立した根拠で示す。

必須（UIで欠落禁止）：

- 希望ステータス：**Community Verified**（固定表示）
- **独立した証拠URL ×2以上**（必須）
  - `communityEvidenceUrls[]`（min:2）
  - UI：入力欄を2つ置き、**「追加」ボタン**で増やせる
  - ルール：
    - 同一サイトの同一ページの言い換えは不可（相互依存は不可）
    - 公式サイトだけに寄せて「偽の根拠」にしない（公式以外も可）

推奨：

- `gallery` 画像（店舗写真：任意）
- `payment_note` / `amenities[]` / `amenities_notes` / `links[]`

### 0.1.5 Report（report）必須入力

**目的**：既存掲載の誤り・危険を是正する（追加掲載ではない）。

必須（UIで欠落禁止）：

- 希望ステータス：**Report（Takedown/修正）**（固定表示）
- **何が誤りか**：`reportWrongWhat`（必須・具体的に）
- **証拠URL**：`reportEvidenceUrls[]`（min:1）
- **希望アクション**：`reportAction`（必須）
  - `hide`（非表示希望）
  - `fix`（修正希望）

添付（任意）：

- `evidence` 画像（任意だが推奨：現地写真/スクショ等）

### 0.1.6 画像（evidence/gallery/proof）の保存と使い方（必須）

画像は **Submissionにのみ紐づく**（Placeの画像とは別）。保存/参照/公開範囲は固定：

- `gallery`：公開可（地図詳細で表示してよい）
- `proof`：**internal専用**（公開禁止）
- `evidence`：**internal専用**（公開禁止）

保存方式・署名URL発行・internal認証の詳細は **`docs/media-storage.md` を正本**とする。  
UI/DB/APIでは **R2直URLを表示しない**。表示は必ず次のエンドポイント経由で行う：

- 公開ギャラリー：`/api/media/submissions/{submissionId}/gallery/{mediaId}`
- internal（proof/evidence）：`/api/internal/media/submissions/{submissionId}/{kind}/{mediaId}`（認証必須）


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
| url | text | 画像URL（アップロード後の**永続URL**） |
| caption | text nullable | 任意 |
| source | text nullable | 任意 |
| created_at | timestamptz |  |

#### 添付画像の運用ルール（固定）
- `kind=gallery` : 店舗紹介/雰囲気写真（公開反映されうる）
- `kind=proof` : **Ownerのみ**。所有/運営の証拠（**公開しない**）
- `kind=evidence` : **Reportのみ**。問題の証拠（**公開しない**。例外的に公開する運用をしたい場合は別途仕様化）

---

### 3.3 `public.verifications`（重要：Submissionと別）
- verifications は placeに付く検証情報。
- default status は **pending**（危険な approved デフォルトは禁止）。

> ここは `docs/db.md` 側にも同じ内容があるはず。重複はこの正本に寄せる。

---

## 4. Submit UI/UX 仕様（確認画面＝Reviewを追加して固定）

### 4.1 画面遷移（固定）
- `/submit`（kind選択）  
  - 選択肢は `owner` / `community` / `report` のみ
- `/submit/{kind}`（入力フォーム）  
  - ボタンは「確認へ」  
  - **この画面では最終送信しない**
- `/submit/{kind}/confirm`（確認画面 / Review）  
  - 入力内容＋添付画像を最終確認  
  - ボタンは「戻って編集」「最終送信」  
  - **この画面でのみ最終送信（POST）を行う**
- `/submit/done`（完了画面）  
  - 200/201: ThankYou（submissionId表示）  
  - 202: Degraded ThankYou（submissionId表示＋保留説明）  
  - 400/429: confirmへ戻してエラー表示（再送可能）

### 4.2 Draft（入力保持）
- `/submit/{kind}` ⇄ `/submit/{kind}/confirm` の往復で入力が消えないこと。
- Draft保持は **ブラウザ内（sessionStorage / localStorage）** を基本とする（無料運営優先）。
- 送信成功（200/201/202）したら Draft は削除する。

### 4.3 送信の二重化防止（固定）
- confirm画面の「最終送信」押下後は、レスポンスが返るまでボタン無効化。
- 成功時は `/submit/done` に遷移し、戻る操作で再送が起きないようにする。

---

## 5. フォーム仕様（UI制限は“必要な箇所だけ”）

### 5.1 共通（全フォーム）
- 画像の許可形式：`image/jpeg,image/png,image/webp`
- 画像サイズ：**≤ 2MB**（UI＋サーバーでチェック）
- SubmitterName：min 2 / max 80（UI制限）
- 送信前のクライアントバリデーション：必須項目、文字数、画像枚数、honeypot
- **confirmへ遷移する前に**最終バリデーションを必ず通す（confirmで「最終送信」できる状態のみ表示する）

---

### 5.2 Owner 申請（`kind=owner`）
**主な上限制約（現状フォームから確定）**
- About: **≤600**
- PaymentNote: **≤150**
- amenities_notes: **≤150**
- CategoryOther: **≤100**
- Gallery: **最大 8枚**
- ProofImage: **1〜4枚**（`kind=proof` として保存する。本人確認＋決済証拠を含む）

**保存ポリシー**
- `submissions.kind=owner`
- `submissions.level=owner`
- `submission_media`:
  - `proof` : 1..4  （必須：本人確認/決済証拠のため）
  - `gallery`: 0..8

---

### 5.3 Community 申請（`kind=community`）
**上限制約（確定）**
- About: **≤300**
- PaymentNote: **≤150**
- amenities_notes: **≤150**
- Address: max 200（UI制限）
- BusinessName: max 80（UI制限）
- Gallery: **最大 4枚**
- **ProofImageは存在しない**（proofは使わない）。ただし **証拠URL（2本以上）** が必須。

**保存ポリシー**
- `submissions.kind=community`
- `submissions.level=community`
- `submission_media.gallery`: 0..4

---

### 5.4 Report（問題報告 `kind=report`）
**上限制約（確定）**
- PlaceName: max 80（UI制限）
- Evidence images: **最大 4枚**
  - フォーム上のラベルは “gallery up to 4” でも良い
  - DB保存は **`submission_media.kind=evidence` に統一**する

**保存ポリシー**
- `submissions.kind=report`
- `submissions.level=unverified`（=reportは検証申請ではない）
- `submission_media.evidence`: 0..4
- report は原則、**既存placeに紐づく**（`place_id` が取れる場合は必ず入れる）
  - deep link/内部UIから report を出す場合は place_id 必須にする（将来）

---

## 6. API仕様（/api/submissions）

### 6.1 エンドポイント
- `POST /api/submissions` （統合）
- 互換：`POST /api/submissions/owner`, `/community` は legacy（内部で統合に流す）

### 6.2 リクエスト形式（確認画面導入により固定）

#### payload（JSON）スキーマ（kind別）

`payload` は JSON文字列。最小は以下。  
（※既存の place フィールドは維持しつつ、**不足していた「希望ステータス」「証拠URL」「本人確認」「希望アクション」**を追加する）

共通（全 kind）：
- `kind`: `"owner" | "community" | "report"`（必須）
- `desiredStatusLabel`: 画面表示用の固定文字列（必須）
  - owner: `"Owner Verified"`
  - community: `"Community Verified"`
  - report: `"Report（Takedown/修正）"`
- `submitterName`（必須）
- `submitterEmail`（必須）
- `placeName`（必須）
- `country` / `city` / `address`（任意）
- `lat` / `lng`（任意）
- `category` / `categoryOther`（任意）
- `about`（任意）
- `paymentNote`（任意）
- `amenities[]`（任意だが **UIに項目を用意する**）
- `amenitiesNotes`（任意）
- `links[]`（任意）

Owner（kind=owner）追加必須：
- `ownerVerification.method`: `"domain" | "work_email" | "dashboard_ss"`（必須）
- `ownerVerification.domain`（method=domain の場合 必須）
- `ownerVerification.workEmail`（method=work_email の場合 必須）
- `ownerPayment.paymentUrl`（任意）  
  ただし **決済証拠は必須**なので、`paymentUrl` が無い場合は `proof` 画像で提出すること。

Community（kind=community）追加必須：
- `communityEvidenceUrls[]`: **min 2**（必須）

Report（kind=report）追加必須：
- `reportWrongWhat`（必須）
- `reportEvidenceUrls[]`: **min 1**（必須）
- `reportAction`: `"hide" | "fix"`（必須）

- **content-type は `multipart/form-data` を基本とする**
  - `payload`：フォーム入力本体（JSON文字列）
  - 画像ファイル：kind別に受け取る
    - owner: `proof`(1..4) + `gallery`(0..8)
    - community: `gallery`(0..4)
    - report: `evidence`(0..4)
- **禁止**：ユーザー入力で任意URLを `submission_media.url` として送らせる運用（URLはサーバーが発行する）

### 6.3 受理/拒否
- **429**: rate limit
- **400**: invalid（schema/required/画像検証NG）または honeypot
- **200/201**: 通常受理（DB保存OK）
- **202**: DB障害 → NDJSON保留に保存して受理扱い（accepted=true）

### 6.4 DB障害時の保留（確定）
- 保留ファイル：`data/submissions-pending.ndjson`
- レコード：`submissionId, receivedAt, payload, error`
- 返却：`{ submissionId, status:"pending", accepted:true }`

> 202の運用上の要件：  
> 「申請内容を捨てない」ことが必須。画像アップロードまで完了している場合は、復旧投入できるよう `payload` 側に画像の参照情報（サーバー発行URLまたは復元可能な情報）を含めること。

---

## 7. 画像保存・URL発行（無料運営前提で固定）

### 7.1 大原則（固定）
- `submission_media.url` は **期限のない永続URL**であること。
- **署名付きURL（期限あり）を `submission_media.url` に保存することは禁止**（永続要件に反する）。
- `gallery` と `proof/evidence` では公開可否が違うため、URL発行方式も分ける。

### 7.2 保存先（固定：無料運営の前提）
- 画像ファイル本体は **オブジェクトストレージ**に保存する（DBにバイナリを入れない）。
- 無料運営のデフォルト保存先は **Cloudflare R2** とする（このプロジェクト方針）。  
  - ただし実装上の抽象化（envで切替）は許容する（例：devはローカル、prodはR2）。  
  - いずれの場合も「永続キーで保存 → 永続URLを発行」の性質は維持する。

### 7.3 オブジェクトキー規約（固定）
- `submissionId` と `mediaId`（UUID）を使い、キーを固定する：
  - `submissions/{submissionId}/{kind}/{mediaId}.webp`
- `kind` は `gallery` / `proof` / `evidence` のみ。

### 7.4 変換/圧縮（無料運営の安全弁として固定）
- アップロード時に必ず以下を行う（サーバー側）：
  - **EXIF削除**
  - **WebP化**（またはWebP相当の固定圧縮）
  - 最大辺リサイズ（例：1600px上限）  
- 目的：保存容量・転送量を無料枠内に収める（運営コストを発生させない）。

### 7.5 URL発行方式（固定：public と internal の二系統）
`submission_media.url` には、ストレージの直URLではなく **アプリの配信エンドポイントURL** を保存する。

- `kind=gallery`（公開可）
  - 例：`/api/media/submissions/{submissionId}/gallery/{mediaId}`
  - 認証不要（公開閲覧OK）
  - CDNキャッシュは許可（表示性能のため）

- `kind=proof` / `kind=evidence`（非公開）
  - 例：`/api/internal/media/submissions/{submissionId}/{kind}/{mediaId}`
  - **運営認証必須**（internalのみで閲覧）
  - publicには絶対に露出しない

> これにより「永続URL」かつ「非公開画像の漏洩防止」を両立する。

### 7.6 保持期限（無料運営のための固定ルール）
- `proof` と `evidence` は **運営確認用途**であり、恒久保存は不要。  
  よって無料運営維持のため、保持期限を設ける：
  - `proof`: 90日（推奨）  
  - `evidence`: 180日（推奨）  
- 期限後はストレージから削除し、DB側は（a）参照削除 or（b）tombstone化（どちらに統一するかは ops で決める）。

> ※保持期限の具体日数は運用開始時に最終確定して良いが、  
> 「期限を設ける」という方針はこの正本で固定する（無料運営の必須条件）。

---

## 8. Internal 審査（/internal/* と /api/internal/*）

### 8.1 Internal の基本フロー
1. Pending一覧を取得
2. 詳細を見て判断（payload＋画像：gallery/proof/evidence）
3. `approve` または `reject`
4. `promote`（掲載反映）※ owner/community のみ

### 8.2 審査状態の意味（submissions.status）
- `pending`: 未処理
- `approved`: 承認（まだ反映前）
- `rejected`: 却下
- `promote`: **DB列ではない**（操作）。promoteの結果は places 等に反映される

### 8.3 Promote 反映先（確定）
- `places`：新規作成または更新
- `media`：公開用の cover/gallery（submission_media.gallery のうち採用分のみ）
- `payment_accepts` / `payments` / `socials`：payload から正規化して反映

> `proof/evidence` は **public media に出さない**（内部証跡）。  
> Report に promote は存在しない（reportは運営が別途 place を修正する運用）。

---

## 9. 「unverified/directory」について（混同を止める）

- **OSM/インポート由来の Place が unverified**（=Place状態）
- **申請は owner/community/report のみ**（=Submission.kind）
- **画像は Submissionにのみ紐づく**（Place状態とは独立）
- Placeの検証状態は `verifications`（または place flags）で管理し、Submissionに持ち込まない。

---

## 10. 実装チェックリスト（改修時に必ず見る）

### 10.1 Submit（owner/community/report）
- [ ] `/submit → /submit/{kind} → /submit/{kind}/confirm → /submit/done` の導線が成立している
- [ ] confirm画面でのみ最終送信（POST）される（入力画面で送信されない）
- [ ] Draftが保持され、confirm→編集に戻っても入力が消えない
- [ ] 二重送信防止が効く
- [ ] kind/required が APIで弾ける
- [ ] `kind=owner` → `level=owner` 固定
- [ ] `kind=community` → `level=community` 固定
- [ ] `kind=report` → `level=unverified` 固定
- [ ] gallery/proof/evidence の枚数制限が両側（UI+API）で効く
- [ ] 画像2MB/形式制限が効く
- [ ] `submission_media.url` は永続URL（署名URL禁止）
- [ ] galleryはpublic閲覧、proof/evidenceはinternal認証必須
- [ ] DB落ちたら 202 + NDJSON で受理される

### 10.2 Internal
- [ ] pending一覧が取得できる
- [ ] approve/reject が status を更新する
- [ ] promote が places 等へ反映する（proof/evidence は公開しない）
- [ ] reportにはpromoteが出ない（運用でplace修正）

---

## 11. Decision Log（この文書でのみ更新）

- 2026-01-24: submissions.level は requested_verification_level として運用固定（reportはunverified固定）
- 2026-01-24: report の画像は submission_media.kind=evidence に統一
- 2026-01-24: proof/evidence は公開に出さない
- 2026-01-24: Submitは「入力→確認（Review）→最終送信」の2段送信を採用し、confirmでのみPOSTする
- 2026-01-24: 画像はオブジェクトストレージ保存＋アプリ配信URLを `submission_media.url` に保存（署名URL禁止）
- 2026-01-24: 無料運営維持のため、アップロード時のWebP化/EXIF削除/リサイズを必須化し、proof/evidenceに保持期限を設ける
