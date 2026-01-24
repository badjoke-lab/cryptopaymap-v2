````md
# State Machine — Site (Submit + Internal) — CryptoPayMap v2 (Authoritative)

この文書は **サイト上の Submit（申請）導線**と、Submitに紐づく **審査（internal）導線**の状態遷移を定義する。  
（※DBの `submissions.status` の状態遷移も含むが、UI遷移と混同しないこと）

---

## 0. スコープと前提（固定）

- Submit の `kind` は **owner / community / report のみ**。
- Submit UI は **入力 → 確認（Review） → 最終送信** の2段送信。
  - 入力フォーム画面では送信しない（confirm でのみ POST する）
- admin側は `/internal` で pending を確認し、**approve / reject** を行う。
- owner/community は approve 後に **promote**（掲載反映）を行う。
- report は **promoteが存在しない**（運営が別途 place を修正する運用）。

---

## 1. Submit UI State Machine（サイト上の導線）

```mermaid
stateDiagram-v2
  [*] --> SubmitKindSelect

  state "SubmitKindSelect (/submit)" as SubmitKindSelect {
    [*] --> KindPicker
    KindPicker --> SubmitDraftOwner : choose kind=owner
    KindPicker --> SubmitDraftCommunity : choose kind=community
    KindPicker --> SubmitDraftReport : choose kind=report
  }

  %% --- Draft states (input forms) ---
  state "SubmitDraft(owner) (/submit/owner)" as SubmitDraftOwner {
    [*] --> DraftEditing
    DraftEditing --> DraftInvalid : client validation fails
    DraftInvalid --> DraftEditing : user edits
    DraftEditing --> SubmitReviewOwner : click '確認へ' (valid)
  }

  state "SubmitDraft(community) (/submit/community)" as SubmitDraftCommunity {
    [*] --> DraftEditing
    DraftEditing --> DraftInvalid : client validation fails
    DraftInvalid --> DraftEditing : user edits
    DraftEditing --> SubmitReviewCommunity : click '確認へ' (valid)
  }

  state "SubmitDraft(report) (/submit/report)" as SubmitDraftReport {
    [*] --> DraftEditing
    DraftEditing --> DraftInvalid : client validation fails
    DraftInvalid --> DraftEditing : user edits
    DraftEditing --> SubmitReviewReport : click '確認へ' (valid)
  }

  %% --- Review states (confirm pages) ---
  state "SubmitReview(owner) (/submit/owner/confirm)" as SubmitReviewOwner {
    [*] --> ReviewReady
    ReviewReady --> SubmitDraftOwner : 戻って編集
    ReviewReady --> SubmitRequestOwner : 最終送信 (POST /api/submissions)
    SubmitRequestOwner --> ReviewBusy : sending (disable button)
    ReviewBusy --> SubmitDoneOK : 200/201 accepted
    ReviewBusy --> SubmitDoneDegraded : 202 accepted (degraded)
    ReviewBusy --> ReviewErrorInvalid : 400 invalid/schema/honeypot
    ReviewBusy --> ReviewErrorRateLimit : 429 rate limit
    ReviewErrorInvalid --> ReviewReady : user fixes (back to edit if needed)
    ReviewErrorRateLimit --> ReviewReady : wait & retry
  }

  state "SubmitReview(community) (/submit/community/confirm)" as SubmitReviewCommunity {
    [*] --> ReviewReady
    ReviewReady --> SubmitDraftCommunity : 戻って編集
    ReviewReady --> SubmitRequestCommunity : 最終送信 (POST /api/submissions)
    SubmitRequestCommunity --> ReviewBusy : sending (disable button)
    ReviewBusy --> SubmitDoneOK : 200/201 accepted
    ReviewBusy --> SubmitDoneDegraded : 202 accepted (degraded)
    ReviewBusy --> ReviewErrorInvalid : 400 invalid/schema/honeypot
    ReviewBusy --> ReviewErrorRateLimit : 429 rate limit
    ReviewErrorInvalid --> ReviewReady : user fixes (back to edit if needed)
    ReviewErrorRateLimit --> ReviewReady : wait & retry
  }

  state "SubmitReview(report) (/submit/report/confirm)" as SubmitReviewReport {
    [*] --> ReviewReady
    ReviewReady --> SubmitDraftReport : 戻って編集
    ReviewReady --> SubmitRequestReport : 最終送信 (POST /api/submissions)
    SubmitRequestReport --> ReviewBusy : sending (disable button)
    ReviewBusy --> SubmitDoneOK : 200/201 accepted
    ReviewBusy --> SubmitDoneDegraded : 202 accepted (degraded)
    ReviewBusy --> ReviewErrorInvalid : 400 invalid/schema/honeypot
    ReviewBusy --> ReviewErrorRateLimit : 429 rate limit
    ReviewErrorInvalid --> ReviewReady : user fixes (back to edit if needed)
    ReviewErrorRateLimit --> ReviewReady : wait & retry
  }

  %% --- Done pages ---
  state "SubmitDone (/submit/done)" as SubmitDoneOK {
    [*] --> ThankYou
    ThankYou --> [*]
  }

  state "SubmitDoneDegraded (/submit/done?degraded=1)" as SubmitDoneDegraded {
    [*] --> ThankYouDegraded
    ThankYouDegraded --> [*]
  }
````

### 1.1 Draft保持（固定）

* Draft（入力値）は `/submit/{kind}` ⇄ `/submit/{kind}/confirm` の往復で消えないこと。
* Draftはブラウザ内（sessionStorage/localStorage）で保持し、送信成功（200/201/202）時に削除する。

### 1.2 送信地点（固定）

* **最終送信は confirm 画面のみ**（入力画面に送信ボタンを置かない）。
* confirmの「最終送信」押下中は二重送信を防ぐためボタン無効化。

---

## 2. Submission Lifecycle（DBの `submissions.status` + promote の意味）

> 注意：`Promoted` は DB の status 列ではなく「反映操作の完了状態」を示す。
> `submissions.status` は `pending/approved/rejected` のままでも良いが、実装上は promote 済みを識別したい場合は別カラム/ログで管理する（この文書では status に追加しない）。

```mermaid
stateDiagram-v2
  [*] --> Pending : POST /api/submissions accepted (200/201/202)

  Pending --> Approved : admin approves
  Pending --> Rejected : admin rejects

  %% optional branch: request more info (future)
  Pending --> PendingMoreInfo : needs info (optional)
  PendingMoreInfo --> Pending : user resubmits/adds info

  %% promote is an action after approved (owner/community only)
  Approved --> Promoted : reflect into places/media/payment_accepts/socials (owner/community only)

  Rejected --> [*]
  Promoted --> [*]
```

### 2.1 promote が存在する/しない（固定）

* `kind in (owner, community)`：Approved → **Promoted（操作）**が存在
* `kind=report`：Approved → **Promotedは存在しない**

  * report は運営が別途 place を修正/削除等して「サイト表示が変わる」

---

## 3. Internal UI State Machine（運営側の導線）

```mermaid
stateDiagram-v2
  [*] --> InternalGate

  InternalGate --> InternalDenied : not authenticated/authorized
  InternalGate --> InternalList : authenticated/authorized

  state "InternalList (/internal)" as InternalList {
    [*] --> ListReady
    ListReady --> InternalDetail : select submission(id)
  }

  state "InternalDetail (/internal/submissions/:id)" as InternalDetail {
    [*] --> DetailReady
    DetailReady --> ApproveRequest : click approve
    DetailReady --> RejectRequest : click reject
    DetailReady --> PromoteRequest : click promote (owner/community only)
    DetailReady --> InternalList : back to list

    ApproveRequest --> DetailReady : success (status=approved, review_note saved)
    ApproveRequest --> DetailError : fail

    RejectRequest --> DetailReady : success (status=rejected, review_note saved)
    RejectRequest --> DetailError : fail

    PromoteRequest --> DetailReady : success (places/media/etc updated)
    PromoteRequest --> DetailError : fail

    DetailError --> DetailReady : retry
  }

  InternalDenied --> [*]
```

### 3.1 InternalDetail に必ず表示するもの（固定）

* `payload` 全文（正規化済み入力）
* `submitted_by`（最小情報）
* `place_id`（あれば）
* `submission_media` を kind 別で表示：

  * `gallery`（公開候補）
  * `proof`（ownerのみ、内部専用）
  * `evidence`（reportのみ、内部専用）

### 3.2 ボタン表示ルール（固定）

* `approve` / `reject`：全kindで表示
* `promote`：**owner/community のみ表示**（reportには表示しない）

---

## 4. Notes（運用上の落とし穴を防ぐ）

* 「approve＝掲載反映」ではない。掲載反映は owner/community の **promote**。
* report は「承認して自動反映」しない。承認は **“運営が対応すべき報告として確定”**の意味。
* confirm導線を入れた以上、送信が二重にならないよう **送信地点をconfirmに固定**する。

```

:contentReference[oaicite:0]{index=0}
::contentReference[oaicite:1]{index=1}
```

