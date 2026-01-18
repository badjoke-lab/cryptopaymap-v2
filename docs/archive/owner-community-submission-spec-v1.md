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
