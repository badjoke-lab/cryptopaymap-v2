# Policies — CryptoPayMap v2 (Authoritative)

**Version:** v2.1  
**Status:** Final (Submit + Media privacy policy 追記)  
**Scope:**  
- Place ID policy（既存：legacy）  
- **Submission（申請）と添付画像（gallery / proof / evidence）の公開範囲・保持・漏洩防止**  
- Internal（運営）でのみ扱うデータの規律  
- 免責（このサイトの情報の性質）

---

## 0. Principles（原則）

1. **No silent changes**  
   仕様・運用は docs を正本とし、推測で改変しない。

2. **Least privilege**  
   非公開データ（proof/evidence）は internal のみ。公開導線に一切出さない。

3. **No perma-leak URLs**  
   非公開画像を「誰でも踏める永続URL」にしない。  
   ただし DBの `submission_media.url` は「永続参照」として必要なので、**アプリ配信URL**を永続化し、認証で守る。

4. **Free-ops first**  
   無料運営を崩さない。ストレージ肥大・転送肥大は、仕様として最初から抑制する。

---

## 1. Submission Policy（申請の扱い）

### 1.1 Submission kinds（固定）
申請種別は以下のみ：
- `owner`
- `community`
- `report`

### 1.2 Report is not a submission to add a place
- `report` は「掲載追加」ではなく、既存掲載の問題報告。
- `report` には promote 操作は存在しない（運営が別途 place を修正する）。

### 1.3 Data minimization（最小化）
- Submitter の個人情報は最小限にする（例：表示名・連絡先程度）。
- 内部レビュー用途を超える情報は収集しない（免許証番号など）。

---

## 2. Submission Media Policy（画像：保存/公開/非公開）

この章は **Submit添付画像の公開範囲と漏洩防止**のための正本。  
（実装は `docs/submissions.md` / `docs/api.md` / `docs/ops.md` と整合すること）

### 2.1 Media kinds（固定）
`submission_media.kind` は以下のみ：
- `gallery`（公開候補）
- `proof`（ownerのみ：所有/運営の証拠、**非公開**）
- `evidence`（reportのみ：問題の証拠、**非公開**）

### 2.2 Public / Internal split（固定）
- `gallery`：公開取得可能（認証不要）
- `proof` / `evidence`：**internal 認証必須（運営のみ）**

### 2.3 永続URLの扱い（重要・固定）
`submission_media.url` は DB に永続的に保存される参照値。

- **禁止：署名URL（期限付きURL）を `submission_media.url` に保存すること**  
  理由：期限切れで参照が壊れる／仕様の「永続参照」に反する。
- **許可：アプリの配信エンドポイント URL を `submission_media.url` に保存すること**
  - gallery: `/api/media/submissions/{submissionId}/gallery/{mediaId}`（public）
  - proof/evidence: `/api/internal/media/submissions/{submissionId}/{kind}/{mediaId}`（internal）

> これにより「永続参照」かつ「非公開を認証で守る」が両立する。

### 2.4 Direct bucket URL policy（禁止）
- R2/S3等の **直URLを public に配布しない**（公開ギャラリーでも基本禁止）。
- バケット直URLにすると、意図せず外部に広がった場合の回収が難しくなるため。

### 2.5 Upload hygiene（必須）
アップロード時に必ず：
- EXIF削除
- WebP化（固定圧縮）
- リサイズ（最大辺上限）
- サイズ上限（≤2MB）と形式制限（jpeg/png/webp）を UI+API で強制

目的：
- 個人情報漏洩（位置情報等）の防止
- 無料運営維持（保存・転送コスト抑制）

---

## 3. Retention Policy（保持期限）

無料運営と漏洩面積の最小化のため、保持期限を設ける。

### 3.1 gallery
- 公開候補として扱うため、原則は長期保持して良い。  
  ただし採用されなかった gallery を長期保持する場合は容量圧迫に注意。

### 3.2 proof / evidence（固定）
- **恒久保存しない（保持期限を必ず設ける）**
- 推奨値（運用開始時に最終確定して良い）：
  - `proof`: 90日
  - `evidence`: 180日
- 期限経過後：
  - ストレージから削除
  - DBは（a）行削除 or（b）tombstone化 のどちらかに統一

---

## 4. Internal Access Policy（運営のみ）

### 4.1 認証・権限
- `/api/internal/**` は必ず authn/authz を通す。
- `proof/evidence` の取得は internal のみ。

### 4.2 Logging（ログ）
- internal のアクセスログを残す（最低限：誰が・いつ・何を見たか）。
- ただしログに画像の中身や個人情報をダンプしない。

### 4.3 No public echo（禁止）
- `proof/evidence` を public UI / public API / public logs に出さない。
- 公開コンテンツ（Placeページ等）への転記も禁止。

---

## 5. Abuse / Safety Policy（悪用防止）

### 5.1 Fake proof / fake report
- proof/evidence は偽造され得る前提で扱う。
- 運営判断で reject できる。

### 5.2 Takedown
- 当事者から削除依頼が来た場合、運営は速やかに proof/evidence を削除できる運用を持つ。

### 5.3 Rate limiting
- Submit は rate limit（429）を必須とする。
- bot対策（honeypot等）を実装して良い。

---

## 6. Disclaimer（免責）

- CryptoPayMap は第三者情報・投稿・ディレクトリを含むため、情報の完全性・正確性は保証しない。
- 受け入れ通貨や営業時間等は変更され得る。
- ユーザーは自己責任で利用する。

---


## 7. Demo Pins Policy (AQ)

To ensure all four verification classes are always visible on the map, four temporary Antarctica demo places are maintained:

- `antarctica-community-1`
- `antarctica-directory-1`
- `antarctica-owner-1`
- `antarctica-unverified-1`

Rules:

- These records are marked in DB via `public.places.is_demo = true`.
- Map display remains enabled for these demo records.
- Stats / Discover and ranking-style aggregates must always exclude demo records via `COALESCE(is_demo, false) = false`.
- Do not use country-based hardcoded exclusions (e.g., `country='AQ'`) for this purpose.
- Once enough non-demo real examples exist for each verification class, these demo pins should be reviewed for removal.

---

## Appendix A — Place ID Policy v1（legacy sources / keep as-is）

> ここから下は従来の Place ID policy を **原文のまま保持**する。  
> Submit/Media policy と混同しないこと。

---

# CryptoPayMap – Place ID Policy v1

Version: 2025-12-xx  
Status: Draft (MVP 実装中だが、この方針に沿って順次整備していく)

---

## 1. Scope / 位置づけ

This document defines how **place IDs** are handled in CryptoPayMap.

- What is the canonical ID format for a place
- How we treat existing OSM-sourced records
- How future owner / community submissions should be identified
- How we plan to migrate from legacy IDs to CPM-native IDs

This is an internal ops/spec document for maintainers and Codex.  
It should be kept in sync between:
- `docs/ops/place-id-policy-v1.md` (GitHub)
- The local project spec set used for Codex tasks.

---

## 2. Current State (MVP, pre-migration)

### 2.1 Data sources

Right now, **all places are sourced from OSM** via a one-off import:

- Source: OpenStreetMap (nodes / ways / relations)
- There is **no user-submitted owner/community data yet** (that will come later).

### 2.2 Legacy place IDs

For these OSM-sourced places:

- The `id` field currently stores **an OSM-derived identifier**  
  (e.g. OSM node/way ID or a value closely tied to that).
- This is treated as a **legacy internal ID**, used only because:
  - It already exists in the data
  - It is unique per place
  - It allows us to ship the MVP quickly

👉 **Policy:**  
For now, we **do not change these legacy IDs**.  
We will migrate them later, in a dedicated ETL / migration phase.

---

## 3. Future Canonical ID Format (CPM ID)

Long term, CryptoPayMap will use its own **CPM-native ID** for all places.

### 3.1 Format (conceptual)

Canonical ID format (subject to minor adjustments, but this is the baseline):

```text
cpm:{countryCode}-{citySlug}-{placeSlug}-{nnn}
````

Examples:

```text
cpm:jp-tokyo-shibuya-satoshi-coffee-001
cpm:us-nyc-brooklyn-crypto-bar-002
```

Where:

* `countryCode`

  * 2-letter country code (ISO-like), e.g. `jp`, `us`, `fr`
* `citySlug`

  * Lowercase, ASCII, hyphen-separated
  * Derived from city / district name
* `placeSlug`

  * Lowercase, ASCII, hyphen-separated
  * Derived from the place name
* `nnn`

  * 3-digit sequence (`001`, `002`, …) to avoid collisions between similar names

This ID is:

* Stable
* Human-readable
* Independent from any external provider (OSM, Google, etc.)

### 3.2 Source metadata fields

Even after we switch `id` to CPM format, we still want to remember where the data came from.

For OSM-sourced records we will use:

* `source: "osm"`
* `source_osm_type: "node" | "way" | "relation" | "unknown"` (optional, but useful)
* `source_osm_id: string` (original OSM ID as string)

For owner/community submissions:

* `source: "owner" | "community" | "directory" | "unverified"` (or similar)
* `source_osm_type` / `source_osm_id` will typically be `null` or missing
  unless we can explicitly match them to an OSM POI.

---

## 4. Short-Term Policy (before migration)

Until we run the full migration to CPM IDs, we adopt this **pragmatic rule**:

### 4.1 Existing OSM places

* Keep using the current `id` value as-is (OSM-derived).
* Treat it as a **temporary internal ID**, but do not change it during MVP.

### 4.2 New OSM places (追加インポート)

If we temporarily add more OSM-based places before the migration:

* Use the **same style of ID as existing OSM records** (OSM-derived).
* This keeps the dataset homogeneous and allows a **single migration script later**.

In other words:

> As long as we are in the “OSM-only + MVP” phase,
> **all places can safely keep using “OSM-style” IDs.**
> Later, a single ETL will convert them to CPM IDs and populate `source_osm_id`.

---

## 5. Migration Plan (high level)

A future ETL / migration step will:

1. Scan all existing place records.
2. For each record:

   * Compute `citySlug` and `placeSlug`.
   * Determine the next available `{nnn}` suffix within that city/place scope.
   * Generate a new CPM ID:

     * `cpm:{countryCode}-{citySlug}-{placeSlug}-{nnn}`
   * Move the old legacy ID into:

     * `source_osm_id` (if OSM-sourced)
     * And set `source: "osm"` (or `source: "manual"` for non-OSM)
3. Save the new CPM ID into the `id` field.

After this migration:

* **All places have CPM IDs**
* External references and importers use:

  * `id` (CPM) as the primary key
  * `source_*` fields for linking back to OSM or other sources

This migration will be defined in more detail in the ETL spec (`data-etl-v3.x.md`).

---

## 6. Owner / Community Submissions

When we eventually open **owner / community / directory submission forms**:

* End-users **do not input IDs** directly.
* Maintainers (or moderation tools) will:

  * Assign a CPM ID (`cpm:…`) according to this policy
  * Fill in `source` + optional `source_osm_id` if applicable

If later we detect that a submitted place corresponds to an OSM POI:

* We **add** `source_osm_id` to link them
* We **do not change** the CPM `id`.

---

## 7. Policy Summary

* **Now (MVP, OSM-only)**

  * Continue using OSM-style IDs for existing and newly imported OSM data.
  * Do not worry about CPM IDs yet in the code / UI.

* **Later (DB + ETL phase)**

  * Run a migration to:

    * Assign CPM IDs to all places
    * Move legacy IDs into `source_osm_id`
    * Standardize `source` / `source_osm_type` fields

* **From that point on**

  * All new places (including owner/community submissions) use CPM IDs.
  * OSM and other external sources are tracked via `source` + `source_*` metadata.

---

## 8. 日本語サマリー（ざっくり）

* 今のデータは全部 OSM 由来で、`id` には OSM のIDっぽい値が入っている。
* これは **一時的な内部ID（レガシー）** として、そのまま使い続ける。
* 将来、ETL フェーズで：

  * 全件 `cpm:〜` 形式の **CryptoPayMap独自ID** に振り直す
  * 元の OSM ID は `source_osm_id` に退避
  * `source: "osm"` などのフィールドで出どころを保持する。
* オーナー申請やコミュニティ申請は、将来的には最初から `cpm:〜` を使う想定。
* いまは「**OSM ID はそのまま使っておき、後で一括で CPM ID に正規化する**」という方針で問題ない。

---


