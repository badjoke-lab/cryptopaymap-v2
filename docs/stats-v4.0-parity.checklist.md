# Stats v4.0 完全パリティ監査チェックリスト（Map母集合 vs Stats全項目）

目的: **Stats は Map の母集合（表示可能集合）を集計する** を前提に、項目漏れなく一致可否を判定する。

判定ラベル:
- **OK**: 定義・データソース・集計キー・UI表示が一致
- **Partial**: 一部一致だが、条件付きで不一致が出る
- **NG**: 構造的に不一致（常時または高確率）

---

## 0. 監査前提（最上位）

- [ ] Map母集合（表示可能集合）をコード根拠付きで定義した
- [ ] Stats母集合（/api/stats が実際に数える集合）をコード根拠付きで定義した
- [ ] 両者の差分を「WHERE条件差 / データソース差 / キャッシュ差 / UI差」で分類した
- [ ] **母集合差分がある場合、以下すべてのメトリクス判定はNGまたはPartialで理由を記載した**

---

## A. 母集合（必須前提）

### A-1. Map母集合（表示可能集合）

- [x] `lat/lng NOT NULL` が必須か
- [ ] `bbox` 適用有無（画面表示集合）
- [ ] `limit/offset` 適用有無
- [ ] `country/city/category/verification/accepted(q=search)` の適用有無
- [ ] `published/approved/promoted/source` の必須条件有無
- [x] DB経路とJSON fallback経路で同一定義か

### A-2. Stats母集合

- [ ] `FROM places` に対する WHERE 条件を列挙
- [x] `lat/lng NOT NULL` 条件有無
- [ ] `published/approved` など表示可否条件有無
- [ ] `promoted/source` の扱い（任意フィルタか必須条件か）
- [x] DB経路とJSON fallback経路で同一定義か
- [ ] `stats_cache` 併用時の出所差（total系 vs ranking系）を確認

---

## B. メトリクス完全一致（全項目）

### B-1. Total places
- [ ] Map母集合期待値SQLを定義
- [x] Stats API返却フィールド（`total_places` / `total_count`）対応を確認
- [ ] 判定（OK/Partial/NG）

### B-2. 4クラス件数（owner / community / directory / unverified）
- [ ] Map母集合期待値SQLを定義
- [x] Stats API返却フィールド（`verification_breakdown.*`）対応を確認
- [ ] level/status解釈差・join重複リスクの有無を確認
- [ ] 判定

### B-3. Countries（distinct）+ Countries ranking
- [ ] distinct countries の期待値SQL
- [ ] countries ranking の期待値SQL
- [x] Stats API返却（`countries`, `country_ranking`）対応を確認
- [ ] 判定

### B-4. Cities（distinct）+ Cities ranking
- [ ] distinct cities の期待値SQL（`country,city` 複合キーを明記）
- [ ] cities ranking の期待値SQL
- [x] Stats API返却（`cities`, `city_ranking`）対応を確認
- [ ] 判定

### B-5. Categories（distinct）+ Category ranking
- [ ] distinct categories の期待値SQL
- [ ] categories ranking の期待値SQL
- [x] Stats API返却（`categories`, `category_ranking`）対応を確認
- [ ] 判定

### B-6. Chains / Assets（Top, ranking, totals）
- [ ] chain top/ranking の期待値SQL
- [ ] asset top/ranking の期待値SQL
- [ ] accepting any の期待値SQL
- [ ] Stats API返却（`top_chains`, `top_assets`, `chains`, `accepting_any_count`）対応を確認
- [ ] 判定

### B-7. Asset Matrix（カテゴリ×アセット等、v4.0定義）
- [ ] 本実装の matrix 定義を明記（asset×chain）
- [ ] Map母集合期待値SQLを定義
- [ ] Stats API返却（`asset_acceptance_matrix`）対応を確認
- [ ] 判定

### B-8. promoted/source/verification などフィルタ軸内訳
- [ ] フィルタ入力軸がMapとStatsで一致するか
- [ ] promoted/source がMap側に存在しない場合の判定
- [ ] verification フィルタ一致可否
- [ ] 判定

---

## C. 0件・縮退・キャッシュ

- [x] DB利用時（Map=DB, Stats=DB）での一致
- [x] JSON fallback時（Map=JSON, Stats=JSON）での一致
- [ ] 片側のみJSON化した時の挙動差
- [ ] キャッシュ鮮度差（Map 20s / Stats cache-control + stats_cache）
- [ ] 0件時レスポンス（NaNや空配列崩れ）

---

## D. 受け入れ判定ゲート

- [ ] 上記 B-1〜B-8 がすべて判定済み（漏れなし）
- [ ] NG/Partial はすべて原因分類済み
- [ ] 各NG/Partialに修正方針（どのWHERE/集計キー/ソースを揃えるか）がある
- [ ] 母集合の一致条件が最優先として明記されている
