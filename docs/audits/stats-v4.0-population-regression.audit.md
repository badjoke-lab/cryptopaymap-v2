# stats v4.0 population regression audit (PR #253 baseline SHA)

## 0. 比較条件
- PR #253 head SHA（固定）: `366eb16de6decc4b6aa285243a3bd876640b6c1c`
- 比較先: `origin/main` 指定が要件だが、この作業環境には `origin` remote が未設定のため `origin/main` を直接解決できない。
- 代替として、ローカル最新 `HEAD`（`73f31614e652b012625f7631dd531bb7551937d5`）を比較先に採用し、差分は **すべて git diff 実測** で判定した。

## 1. 差分抽出（実測）
実行コマンド:

```bash
git diff --name-only 366eb16de6decc4b6aa285243a3bd876640b6c1c..HEAD
```

結果（必須対象との突合）:
- 変更あり: `app/api/stats/route.ts`
- 変更あり: `app/(site)/stats/StatsPageClient.tsx`
- 変更なし: `app/api/places/route.ts`
- 変更なし: `lib/**`（PR253→HEADで該当差分なし）

## 2. 母集合分裂の監査結果（断定）

### 2.1 /api/stats **内部**（total / breakdown / rankings / chains / matrix）
- `filtered_places` CTE を作成し、各メトリクスSQLが同じ CTE を参照する構造は維持されている。
- `total_places`・`countries`・`cities`・`categories`・`verification`・`category_ranking`・`country_ranking`・`city_ranking`・`top_chains`・`top_assets`・`accepting_any_count`・`asset_acceptance_matrix` は、いずれも `filtered_places` を基準に集計している。
- よって、**/api/stats 内部の母集合は分裂していない**。

### 2.2 /api/stats と /api/places の **相互整合**
- ここで分裂が発生している。
- 原因は、`verification` の正規化ルールが両APIで一致していないこと。

## 3. 崩れたメトリクス一覧
1. `verification=<value>` フィルタ適用時の `total_places` / `total_count`（stats と places の件数不一致）
2. 上記件数差に起因する `breakdown` / `verification_breakdown`
3. 同一母集合前提の `top_chains` / `top_assets`
4. `category_ranking` / `country_ranking` / `city_ranking`
5. `asset_acceptance_matrix` / `accepting_any_count`

※ すべて「/api/stats 内部で壊れた」のではなく、**/api/places との母集合定義不一致**として崩れる。

## 4. 崩れた原因コード（ファイル+行番号+diff要約）

### A. stats側（PR253→HEADで変更された点）
- `app/api/stats/route.ts` に `normalizeVerificationSql` が追加され、`owner/community/directory` 以外を `unverified` に正規化するよう変更された。これが `verification` フィルタと集計（LATERAL JOIN側）に適用される。  
  - 追加/適用箇所: `normalizeVerificationSql` 定義、`buildFilterSql` 内の verification 条件、verification 集計SQL。  
  - 参照: `app/api/stats/route.ts` 360-366, 412-423, 513-530。

### B. places側（PR253→HEADで未変更のまま残った点）
- `app/api/places/route.ts` は verification 判定で `COALESCE(v.<field>, 'unverified')` を使い、`report/pending/verified` などの非正規値を `unverified` に畳み込まない。  
  - 参照: verification SELECT/WHERE。  
  - 参照: `app/api/places/route.ts` 364-366, 415-421。

### 断定（diffベース）
- PR253→HEADで stats 側のみ verification 正規化仕様が変わり、places 側は据え置き。  
- その結果、`verification` フィルタ時の母集合定義が stats と places で一致しなくなった。

## 5. 最短で PR253方式へ戻す修正方針（1つに固定）
- **方針は1つ**: `verification` の正規化ロジックを `/api/places` と `/api/stats` で完全共通化する。  
  具体的には、`owner/community/directory` 以外を `unverified` に畳み込む同一SQL（または同一定義）を両APIの verification SELECT/WHERE に適用する。

## 6. 次タスクで使う compare コマンド
```bash
# 本来要件
# git diff --name-only 366eb16de6decc4b6aa285243a3bd876640b6c1c..origin/main

# この環境で実行可能な代替（remote未設定）
git diff --name-only 366eb16de6decc4b6aa285243a3bd876640b6c1c..HEAD

git diff 366eb16de6decc4b6aa285243a3bd876640b6c1c..HEAD -- app/api/places/route.ts app/api/stats/route.ts 'app/(site)/stats/StatsPageClient.tsx' 'lib/**'
```

## 7. 修正後の再監査（このPR）
- 母集合WHEREを `lib/population/mapPopulationWhere.ts` に集約し、`/api/places` と `/api/stats` の両方が同一実装を参照する構造に変更した。
- `/api/stats` の集計は `WITH map_pop AS (...)` を唯一の母集合CTEとして統一し、`total/breakdown/distinct/rankings/chains/matrix` をすべて `map_pop` から算出する。
- `/api/stats` は `meta.population="map_pop"`, `meta.where_version="pr253"`, `meta.limited`, `meta.source` を常に返す。
- fallback/limited時は全メトリクスを0/空で返し、部分的cache/部分的dbの混在を廃止した。
