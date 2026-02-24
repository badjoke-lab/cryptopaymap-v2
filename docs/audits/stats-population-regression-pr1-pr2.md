# PR1→PR2 population regression audit (diff-based, no speculation)

## 0. 対象PRとSHAの確定
このリポジトリは `gh` / `origin pull/<id>/head` が使えないため、ローカル履歴の PR番号付きコミットを比較起点に採用。

- **PR1 (#253) head SHA**: `366eb16de6decc4b6aa285243a3bd876640b6c1c`
  - subject: `Align stats base population with map-displayable places (#253)`
- **PR2 (#254) head SHA**: `2f663dc3d5864ff6c409bdf4413d2fb87edac1f2`
  - subject: `Implement stats v4 verification breakdown parity and UI (#254)`

## 1. 必須diffの実行結果

### 1.1 `git diff --name-only PR1..PR2`
変更ファイル:
- `app/(site)/stats/StatsPageClient.tsx`
- `app/api/stats/route.ts`
- `components/stats/VerificationDonut.tsx`
- `docs/audits/stats-v4.0-parity.audit.md`
- `docs/stats-v4.0-parity.checklist.md`

**重要**: `app/api/places/route.ts` と `lib/**` は差分なし。

### 1.2 `git diff PR1..PR2 -- app/api/stats/route.ts`
母集合/集計分岐に関係する差分は `app/api/stats/route.ts` のみ。

### 1.3 `git diff PR1..PR2 -- app/api/places/route.ts`
差分なし。

### 1.4 `git diff PR1..PR2 -- lib/**`
差分なし。

## 2. /api/stats の母集合定義（PR1→PR2で何が変わったか）

## 2.1 変わっていない点（= total_places の母集合WHERE本体）
- `filtered_places` CTE ベースの集計構造は維持。
- map displayable 条件（lat/lng）を含む母集合WHEREの主構造に差分なし。
- `places`/`verifications`/`payment_accepts` 等の参照テーブル構成も大枠維持。
- `stats_cache` 混在分岐・fallback分岐にPR1→PR2差分なし。

→ したがって、**全体（filterなし）の total_places を決める母集合WHEREがPR2で直接変更された証拠はdiff上にない**。

## 2.2 変わった点（回帰ポイント）
PR2で追加された `normalizeVerificationSql` により、verificationの決め方が Stats 側だけ変更。

### 変更点A: verification filter条件の判定ロジック変更
- 旧（PR1）: `COALESCE(NULLIF(BTRIM(v.<col>), ''), 'unverified')`
- 新（PR2）: `normalizeVerificationSql(...)` + priority order（owner/community/directory/else）
- diff hunk: `@@ -380,10 +410,15 @@`

### 変更点B: verification breakdown集計のjoinロジック変更
- 旧（PR1）: `LEFT JOIN verifications v ON v.place_id = p.id` で直接 group
- 新（PR2）: `LEFT JOIN LATERAL (...) vs` で1件選択 + 正規化して group
- diff hunk: `@@ -478,9 +513,20 @@`

### 変更点C: response payloadに breakdown を追加（副次）
- `breakdown` フィールド追加と整合チェックログ追加
- diff hunk: `@@ -296,6 +311,20 @@`, `@@ -639,12 +691,13 @@`

## 3. “なぜ戻ったか” の断定（diffベース）

### 断定1
PR1→PR2で **`/api/places` は一切変わっていない**。

### 断定2
PR1→PR2で母集合分岐に関わる差分は **`/api/stats` の verification 解釈変更だけ**。

### 断定3
したがって、PR2で観測された「PR1で揃っていたのに戻った」現象は、
**母集合WHEREそのものの変更ではなく、Stats側の verification 正規化/抽出ロジック変更が places 側と非対称になったこと**で発生した（特に verification filter時）。

## 4. 戻り原因コード（ファイル+行番号+diff要約）

1) `app/api/stats/route.ts`
- `@@ -335,6 +357,14 @@` で `normalizeVerificationSql` 新設。
- `@@ -380,10 +410,15 @@` で verification filter条件が新関数ベースへ変更。
- `@@ -478,9 +513,20 @@` で verification集計が `LEFT JOIN` → `LEFT JOIN LATERAL` に変更。

2) `app/api/places/route.ts`
- PR1→PR2差分なし（つまり Stats 側変更に追随していない）。

3) `lib/**`
- PR1→PR2差分なし（共通化層が無く、Stats単独変更になっている）。

## 5. 最短修正提案（戻り防止）
1. verification正規化関数を `lib` の共通モジュールに固定。
2. `/api/stats` と `/api/places` の両方が同一関数（同一SQL式）を参照する構造へ変更。
3. regression testとして「verification filter時に map件数と stats total_count が一致」を追加。

以上より、PR1→PR2の戻りは **Stats単独の verification 解釈変更** が根本原因と断定できる。
