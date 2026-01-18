# Submissions — CryptoPayMap v2 (Authoritative)

## Canonical decisions
- Submission kinds are only: owner, community, report
- unverified and directory are place state, not a submission kind
- Unverified places do not have submission_media by definition

## Appendices (legacy sources)


---

# Owner & Community Submission Flow v1

オーナー＆コミュニティ登録フロー v1

## 1. 目的 / Purpose

* **目的（日本語）**
  既存の OSM 由来データに加えて、

  * 店舗オーナー
  * コミュニティメンバー（常連客・運営関係者など）
    からの登録リクエストを受け付けるための「応募フロー」を定義する。

* **Purpose (English)**
  Define the initial submission flow that allows:

  * store owners
  * community members
    to submit new places or updates, on top of the existing OSM-derived dataset.

このバージョンでは「最終保存先（JSON / DB）」を固定せず、
**後から保存先を差し替え可能な API 契約と UI** を目標にする。

---

## 2. 対象ロール / User roles

### 2.1 Owner submission

* 実店舗の **オーナー / 運営者** 本人、またはそれに準ずる担当者。
* 新規登録だけでなく、既存店舗の

  * 情報修正
  * 認証ステータス（例: directory → owner）
    などの申請もここで受け付ける。

### 2.2 Community submission

* 常連客・コミュニティメンバー・ファン等、**店舗関係者ではないが、店舗をよく知るユーザー**。
* 新しく見つけた「クリプト決済対応店舗」の推薦や、
  既存データの誤り報告（例: もうクリプトを受け付けていない）を送る。

---

## 3. 入力項目 / Form fields

`Place` 型をベースに、Owner / Community 共通の「場所情報」＋「連絡用情報」を集める。

### 3.1 共通の場所情報（CandidatePlace core）

必須（Required）：

* `name`
* `country`（ISOコード, 例: JP, US — `/api/filters/meta` の `countries` に合わせる）
* `city`（filters.meta で扱う city 名に近い表記）
* `address`（人間が見て分かる住所）
* `category`（cafe, restaurant, diner など、`/api/filters/meta` の `categories` から選択）
* `accepted`（複数選択。`chains` から選択: BTC / BTC@Lightning / ETH / USDT など）
* `verificationTypeRequested`

  * `"owner"` または `"community"`
  * directory/unverified への変更は運営側のみが使う（ユーザーは選べない）

任意（Optional）：

* `lat`, `lng`

  * 分かる場合のみ。分からなければ運営側で補完。
* `about`

  * 店の説明（max 600 文字くらいを推奨）
* `paymentNote`

  * 「Lightningのみ」「少額はBTC, 高額はUSDT」など (max 150 文字程度)
* SNS / web:

  * `website`
  * `twitter`, `instagram`, `facebook`
* `amenities`

  * wifi / outlets / takeout など（チェックボックス形式を想定）

### 3.2 申請者情報 / Submitter info

Owner / Community 共通：

* `submitterName`（必須）
* `submitterEmail`（必須）
* `role`（owner / staff / customer / other）
* `notesForAdmin`（任意。運営への補足 〜300 文字）

---

## 4. ID 付与ルールとの関係 / ID policy

ID のルールは別ファイル `docs/place-id-policy-v1.md` に定義済み。

この仕様では、**フォームから送信された時点では以下のように扱う**：

1. **クライアント側**

   * ID はその場では確定しない（Preview 用に一時 ID を生成するのはアリ）。
2. **サーバー側 (API)**

   * 保存時に `place-id-policy-v1` のルールに従って ID を生成する。
   * 例（Owner 提出の東京のカフェ）：

     * `cpm:tokyo:owner-cafe-7`
   * OSM 由来のデータは `place-id-policy-v1` に記載した「OSM ソース用の接頭辞ルール」に従う。

この v1 仕様では：

* **「ID の決定＝永続保存タイミング」** とし、
* Submit 時点では `candidateId` などの一時 ID を使うことはあっても、
  本番 ID はまだ確定しない前提。

---

## 5. API レイヤーの設計方針 / API design (v1)

将来 DB に差し替えやすいよう、**API の形だけ先に固定しておく**。

### 5.1 エンドポイント候補

* `POST /api/submissions/owner`
* `POST /api/submissions/community`

リクエストボディ（例／共通）：

```jsonc
{
  "kind": "owner",              // "owner" | "community"
  "place": {
    "name": "Satoshi Coffee",
    "country": "JP",
    "city": "Tokyo",
    "address": "1-1 Chiyoda, Tokyo",
    "category": "cafe",
    "lat": 35.68,
    "lng": 139.76,
    "accepted": ["BTC", "BTC@Lightning", "ETH"],
    "about": "A cozy Bitcoin-first cafe...",
    "paymentNote": "Lightning preferred under $20",
    "website": "https://...",
    "twitter": "@...",
    "instagram": "@...",
    "facebook": "..."
  },
  "submitter": {
    "name": "Store Owner",
    "email": "owner@example.com",
    "role": "owner",
    "notesForAdmin": "We started accepting BTC last month."
  }
}
```

レスポンス（v1 の想定）：

* 200 OK 時：

```jsonc
{
  "status": "received",               // or "preview"
  "normalizedPlace": {
    // Place 型に近い形に正規化したオブジェクト
    // id はあってもなくてもよい（v1では optional）
  }
}
```

* 保存方式はこの仕様では固定しない：

  * v1: ログ出力のみ / ダミー保存
  * v2: JSON ファイル（例: `data/submissions/owner-*.json`）
  * v3: Postgres + PostGIS の正式テーブル

---

## 6. フロントエンド UX 方針 / Frontend UX

### 6.1 ページ構成

* `/submit` (仮)

  * タブまたはトグル：

    * `Owner`
    * `Community`
  * 上部に各ロール向けの説明（EN/JA 並記）
  * 中央：フォーム
  * 送信後：

    * v1 では「受け付けました」メッセージ＋
      （あれば）normalizedPlace のプレビュー表示
    * まだ「マイページ」などは持たない（ログインなし）

### 6.2 バリデーション

* 必須項目はクライアント側で basic チェック：

  * 空欄チェック
  * メール形式チェック
  * country / category / accepted は選択肢からのみ
* 文字数上限（目安）：

  * `about`: ~600
  * `paymentNote`: ~150
  * `notesForAdmin`: ~300

---

## 7. 将来の拡張 / Future phases

この仕様のあとで検討する拡張：

* 保存先を **Neon / Postgres + PostGIS** に切り替える
* submissions に

  * `status`（pending / approved / rejected）
  * `source`（osm / owner / community / directory）
  * `reviewedBy` などのメタデータを付ける
* 管理用 UI（非公開）：

  * pending submissions の一覧
  * 差分ビュー（既存 Place との比較）
  * ワンクリックで「承認 → map/stats に反映」

---


---

# Submissions 運用の最小導線 v1 (GitHub only)

目的: admin UI なしで「投稿 → レビュー → 反映」を GitHub だけで回せる最小運用を定義する。  
実装追加は行わず、ドキュメントとテンプレで運用を固める。

---

## 1. 投稿が溜まる場所

現状の保存先は以下の通り。

* **通常保存**: `data/submissions/<submissionId>.json`  
  API 受信後に JSON で保存される。スキーマは `StoredSubmission` 相当で、
  `status` や `payload` を含む。  
* **DB 障害時の保留**: `data/submissions-pending.ndjson`  
  DB が利用できない場合に NDJSON として追記される。

> GitHub-only 運用では Issue を一次窓口にしつつ、反映のタイミングで
> `data/submissions` / `data/places.json` を更新する。

---

## 2. 投稿受付（Issue）

1. GitHub Issue を `Submission` テンプレから作成する。
2. 必須項目の入力漏れがあれば Issue で追記依頼する。
3. ラベル例:
   * `submission:owner` / `submission:community`
   * `submission:needs-review`

---

## 3. レビュー観点（最小）

最低限、以下を確認する:

* **必須項目が揃っているか**  
  例: 店名、住所、国/都市、カテゴリ、受け入れチェーン、申請者情報。
* **重複・既存店の確認**  
  `data/places.json` に同名/同住所が無いか。
* **受け入れ実態の根拠**  
  公式サイト・SNS・写真などの根拠リンクがあるか。
* **位置情報の妥当性**  
  lat/lng がある場合は実在チェック（Google Maps など）。

レビューの結果は Issue のチェックボックスに反映する。

---

## 4. 反映手順（PR）

### 4.1 data/submissions に記録

Issue の内容をもとに `data/submissions/<submissionId>.json` を追加する。

* 既存 API で作られる形式に合わせる:

```jsonc
{
  "submissionId": "sub-YYYYMMDD-HHMMSS-xxxxx",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "status": "pending",
  "suggestedPlaceId": "cpm:jp-tokyo-owner-cafe-satoshi-abcde",
  "payload": {
    "name": "Satoshi Coffee",
    "country": "JP",
    "city": "Tokyo",
    "address": "1-1 Chiyoda, Tokyo",
    "category": "cafe",
    "acceptedChains": ["BTC", "BTC@Lightning"],
    "verificationRequest": "owner",
    "contactName": "Store Owner",
    "contactEmail": "owner@example.com",
    "role": "owner",
    "about": "...",
    "paymentNote": "...",
    "website": "https://..."
  }
}
```

* Issue に紐づく PR で **ステータス更新**:
  * 承認時: `status: "approved"` + `reviewedAt` を追加
  * 却下時: `status: "rejected"` + `reviewNote` を追加

### 4.2 data/places.json への反映

承認された submission を `data/places.json` に追加する。  
`name`/`address`/`category`/`lat`/`lng` などを一致させ、必要に応じて
レビューコメントで理由を残す。

> 反映の詳細な変換ロジックは次 PR で自動化予定。現状は手動で OK。

---

## 5. バリデーション（任意だが推奨）

PR 作成時に以下で簡易チェックできる:

```bash
node scripts/validate_submissions.ts
```

---

## 6. Manual test (最小確認)

* Issue テンプレから投稿が作れること。
* Review のチェックリストが機能すること。



---

# JSON保険（places.json fallback）運用ルール

## 目的
DB障害などで本来のデータソースが0件になる事故を避け、最低限のデモ/回遊ができる状態を保つための「保険」として運用する。

## なぜ必要か
- DB障害や接続不良が起きたときに、0件表示で体験が止まるのを防ぐ。
- 最低限のデータがあることで、UIや導線の確認が継続できる。

## いつ更新するか
以下のいずれかを満たすタイミングで更新する。
- 大きなデータ更新（カテゴリ追加や構造変更）を行ったとき
- リリース前（動作確認の基準を合わせたいとき）
- 月1回の定期メンテナンス時

## いつ捨てるか
次の状態が揃ったら保険JSONの運用を廃止する。
- DB稼働が安定し、障害時の監視・アラートが整備されている
- 再試行・キャッシュ・フェイルオーバーなどの仕組みが実装済み
- DB停止時でも最低限の体験が保証される手段がある

## 古さの許容範囲
- 目的は「最低限のデモ/回遊」なので、多少古くても許容する。
- 正確性が必要な情報（例: 営業時間や最新イベント）はJSONで担保しない。

## 事故時の挙動確認方法
- `DATA_SOURCE=json` に切り替えてJSONが返ることを確認する
- `DATA_SOURCE=auto` でDBが落ちている状況を想定し、JSON fallback が動くことを確認する

## 注意
- JSONは真実のデータではなく「保険」である。
- 仕様決定や最新情報の根拠にしない。
