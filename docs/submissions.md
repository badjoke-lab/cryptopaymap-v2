# Submissions — CryptoPayMap v2 (Authoritative)

この文書は **Submit（申請）と審査・反映（internal）** に関する唯一の正本。  
（※Submit UI/UX・API・画像保存/URL発行・internal審査フローまで含む）

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
- ProofImage: **単独 1枚**（`kind=proof` として保存する）

**保存ポリシー**
- `submissions.kind=owner`
- `submissions.level=owner`
- `submission_media`:
  - `proof` : 0..1
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
- **ProofImageは存在しない**（galleryのみ）

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
- **content-type は `multipart/form-data` を基本とする**
  - `payload`：フォーム入力本体（JSON文字列）
  - 画像ファイル：kind別に受け取る
    - owner: `proof`(0..1) + `gallery`(0..8)
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
