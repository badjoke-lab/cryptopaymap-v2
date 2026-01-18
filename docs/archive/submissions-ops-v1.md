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

