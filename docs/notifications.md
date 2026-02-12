## 通知機能仕様書（CryptoPayMap / Submissions Notifications Spec v1）

### 1. 目的

* 申請者が「送った後どうなったか」を追跡できること
* 運営が「何が来たか／何が詰まってるか」を即把握できること
* 通知失敗があっても**本処理（申請・審査・反映）を止めない**こと
* 二重送信やスパム化を防ぐこと

### 2. 範囲

* 対象フロー：`submit → review(approve/reject) → promote(publish)`
* 対象データ：`submission`（kind: owner/community/report）
* 対象通知：**メール通知のみ**
* 対象受信者：**申請者（submitterEmail）** と **運営（OPS_NOTIFY_EMAIL）**
* UI上の表示（/submit/done 等）は別仕様だが、通知と整合する文言のみここで定義する

### 3. 通知チャネル

* **Email only**
* 送信プロバイダは1つに固定（実装で選定し、環境変数で設定）

### 4. イベント一覧（全パターン）

> すべて実装対象。ここにない通知は出さない。

#### 4.1 申請者向け（Submitter）

A-1. **Submission received (OK)**

* 条件：`POST /api/submissions` が DB+R2 保存完了（200/201相当）
* 目的：受付確定と追跡ID提示

A-2. **Submission received (Queued 202)**

* 条件：`POST /api/submissions` が 202（受理のみ／後処理待ち）
* 目的：受理はできたが遅延中であることを明示

A-3. **Submission failed (4xx)**（任意実装ではなく“本仕様では実装対象”）

* 条件：`POST /api/submissions` が 4xx で拒否、かつ送信条件（§9）を満たす
* 目的：修正点を返して再送可能にする
* 注意：スパム対策必須（§9）

A-4. **Approved**

* 条件：`POST /api/internal/submissions/[id]/approve` 成功、status=approved 確定
* 目的：審査OKを通知（※この時点で掲載URLは出さない）

A-5. **Rejected**

* 条件：`POST /api/internal/submissions/[id]/reject` 成功、status=rejected 確定
* 目的：却下理由と再申請案内

A-6. **Published**

* 条件：`POST /api/internal/submissions/[id]/promote` 成功、place反映完了＋公開URL確定
* 目的：掲載完了とURL提示

A-7. **Publishing delayed**

* 条件：promote が失敗（例外）し、承認済み（approved）で公開遅延が発生
* 目的：「承認されたのに載らない」不信感の回避

#### 4.2 運営向け（OPS）

B-1. **New submission (OK)**

* 条件：A-1 発生
* 内容：submission概要＋internal管理URL

B-2. **New submission (Queued 202)**

* 条件：A-2 発生
* 内容：202受理が溜まると詰むので即通知

B-3. **Reviewed (Approved/Rejected)**

* 条件：A-4 または A-5 発生
* 内容：decision、reviewer、note、internalURL

B-4. **Published**

* 条件：A-6 発生
* 内容：公開URL、placeId/slug、submissionId

B-5. **Promote failed**

* 条件：A-7 発生
* 内容：エラー要約＋再実行導線

B-6. **Notify failed**

* 条件：任意の通知送信が失敗
* 内容：どの通知が失敗したか、submissionId、エラー要約

### 5. 送信タイミング（どこで出すか）

#### 5.1 `POST /api/submissions`

* 保存成功（commit相当）後：A-1 + B-1
* 202分岐（NDJSON保留）後：A-2 + B-2
* 4xx確定時：条件を満たす場合のみ A-3

#### 5.2 `POST /api/internal/submissions/[id]/approve`

* status=approved 確定後：A-4 + B-3

#### 5.3 `POST /api/internal/submissions/[id]/reject`

* status=rejected 確定後：A-5 + B-3

#### 5.4 `POST /api/internal/submissions/[id]/promote`

* promote成功（place反映完了＋URL確定）後：A-6 + B-4
* promote失敗（例外catch）後：A-7 + B-5
* 通知送信失敗時：B-6（可能なら）

### 6. 本処理と通知の優先順位

* **通知が失敗しても本処理は成功扱いで継続**する

  * 例：申請保存成功→メール失敗でも申請は成立
* 通知失敗は **ログと運営通知（B-6）**で回収する
* promote自体が失敗した場合は promote API は失敗を返す（通知とは別）

### 7. 冪等性（重複送信防止）

* 単位：`submission_id + event_type + recipient_type`
* 原則：同一キーは **1回だけ送る**
* 実装要件：

  * 通知ログにユニーク制約（推奨）
  * 既にsentなら送らず `skipped` 記録

### 8. 通知ログ（監査）

* すべての通知イベントは記録される
* 最低記録項目：

  * `submission_id`
  * `event_type`
  * `recipient_type`（submitter/ops）
  * `to_email`
  * `status`（sent/failed/skipped）
  * `provider_message_id`（あれば）
  * `error`（failedのみ）
  * `created_at`

### 9. 4xx失敗メール（A-3）の送信条件（スパム対策）

A-3 は以下を満たす場合のみ送信する：

* `submitterEmail` が妥当形式
* レート制限を通過

  * IP単位（例：短時間に過剰送信不可）
  * メールアドレス単位（例：同一宛先へ連投不可）
* honeypot等のボット判定に引っかからない
* エラー理由がユーザー修正で解決可能なもの（必須欠落/形式/サイズ等）

※条件を満たさない場合：メール送信はせず、APIレスポンスのみ。

### 10. メールテンプレ要件（共通）

* 形式：プレーンテキスト（HTML任意だが必須ではない）
* 必須変数：

  * `submissionId`
  * `kind`
  * `businessName`（あれば）
  * `country/city`（あれば）
  * `submittedAtJST`
* A-5（Rejected）は `reviewNote` を含む

  * 長文は上限で切る（例：1000文字）
  * HTML/危険文字は無害化（テキスト化）

### 11. 環境変数

必須：

* `MAIL_FROM`
* `OPS_NOTIFY_EMAIL`
* `MAIL_PROVIDER`
* プロバイダ鍵（例：`RESEND_API_KEY` / `SENDGRID_API_KEY` / `AWS_*`）

任意：

* `MAIL_REPLY_TO`
* `NOTIFY_ENABLED`（デフォルト true）
* `NOTIFY_SUBMITTER_ENABLED`（デフォルト true）
* `NOTIFY_OPS_ENABLED`（デフォルト true）

### 12. エラー処理

* 送信失敗：

  * `notification_events.status=failed` を記録
  * 可能なら OPSに B-6 を送る
  * それも失敗ならサーバーログのみ（structured log推奨）
* 通知を送る前に本処理を確定する（DB更新後）

### 13. テスト要件（必須の再現ケース）

* owner/community/report の申請成功 → A-1/B-1
* 202強制 → A-2/B-2
* 4xx（必須欠落）→ 条件OKなら A-3
* approve → A-4/B-3
* reject → A-5/B-3
* promote成功 → A-6/B-4
* promote失敗 → A-7/B-5
* 通知送信失敗（擬似）→ B-6 とログ

---

## 変更禁止ルール

* この仕様書が「通知の正本」。**実装はこれに一致させる**。
* 追加・変更する場合は、このファイルに差分として明記し、バージョン（v2等）を上げる。

---

必要なら、この仕様書に合わせて **「実装タスクリスト（PR単位）」**も同じフォーマットで作る。
今すぐ作るなら、リポジトリの docs の置き場所（`docs/` があるか）だけは俺が勝手に決める：**`docs/notifications.md`**に置く想定で進める。
