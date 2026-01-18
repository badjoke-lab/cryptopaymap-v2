# Policies — CryptoPayMap v2 (Authoritative)

## Appendices (legacy sources)


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