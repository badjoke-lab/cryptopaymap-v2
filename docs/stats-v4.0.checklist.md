# Stats v4.0 Checklist (Fixed Pass/Fail Criteria)

このチェックリストは `docs/stats-v4.0.md` を正として抽出した **v4.0合否基準** です。  
以後の実装・監査は本ファイルのみを判定基準とし、口頭基準は使用しません。

---

## Snapshot

- [ ] **Snapshotはv3必須ブロックを完全に持つ**（Total Count / Verification Breakdown(donut) / Chains-Assets(bar) / Category ranking / Countries ranking / Cities ranking / Asset Acceptance Matrix）  
  確認方法: Stats画面で7ブロックがすべて描画されることをUI確認する。  
  現状: **NG**

- [ ] **初期表示でSnapshotは全体値を表示する**（Filtersデフォルト）  
  確認方法: 初回表示時に全体集計値が表示されることを確認する。  
  現状: **OK**

- [ ] **Snapshotはフィルタ条件で再集計される**  
  確認方法: country/city/category等のフィルタ変更後にSnapshot値だけが変化することを確認する。  
  現状: **NG**

---

## Trends

- [ ] **Trends期間セレクタを持つ**（24h/7d/30d/All）  
  確認方法: Trends UIに4つの期間切替があり、選択状態が反映されることを確認する。  
  現状: **NG**

- [ ] **期間ごとの粒度が仕様どおり**（24h=1h, 7d=1d, 30d=1d, All=1w or 1mo）  
  確認方法: 各期間でx軸ラベル間隔・API粒度メタが仕様一致することを確認する。  
  現状: **NG**

- [ ] **KPI推移は最低3系列を表示**（Total places / Verified places / Accepting any crypto）  
  確認方法: Trends折れ線に3系列凡例と系列値が表示されることを確認する。  
  現状: **NG**

- [ ] **KPI推移は折れ線で、hover/tapで値を確認できる**  
  確認方法: ポイントにhover/tapしてツールチップ等で値が読めることを確認する。  
  現状: **Partial**

- [ ] **内訳推移を最低1種類表示**（Verification stack または Top5 Categories または Top5 Countries）  
  確認方法: Trends内に少なくとも1つの内訳推移チャートが存在することを確認する。  
  現状: **NG**

- [ ] **Trends初期表示は7d**  
  確認方法: 画面初期ロード時の選択期間が7dであることを確認する。  
  現状: **NG**

- [ ] **期間変更時はTrendsのみ再描画し、Snapshotは不変**  
  確認方法: 期間切替前後でSnapshot値が不変、Trendsのみ変化することを確認する。  
  現状: **NG**

---

## Filters

- [ ] **Filters Barはv3同等項目を持つ**（country/city/category/accepted/verification/promoted/source等）  
  確認方法: Filters Bar上に仕様項目が存在することをUIで確認する。  
  現状: **NG**

- [ ] **フィルタはSnapshotのみに影響し、Trendsは常に全体固定**  
  確認方法: フィルタON/OFFでSnapshotは変化し、Trends系列値が不変であることを確認する。  
  現状: **NG**

- [ ] **フィルタ変更でTrends APIを再取得しない**  
  確認方法: ネットワークログでフィルタ操作時に`/api/stats/trends`が再実行されないことを確認する。  
  現状: **NG**

---

## 0件 / 失敗時

- [ ] **Snapshot 0件時は全項目0を表示**（NaN/空白禁止）  
  確認方法: 0件データで各Snapshotブロックが0または空集合の明示表示になることを確認する。  
  現状: **Partial**

- [ ] **Trends 0件時は0ラインを描画**（NaN/空白禁止）  
  確認方法: 0件データでTrendsチャートに水平0ラインが描画されることを確認する。  
  現状: **NG**

- [ ] **Snapshot取得失敗時は直近成功キャッシュを優先表示**  
  確認方法: Snapshot API失敗時に前回成功値が維持されることを確認する。  
  現状: **Partial**

- [ ] **Snapshot取得失敗でキャッシュなしの場合は0＋エラーメッセージ表示**（真っ白禁止）  
  確認方法: 初回失敗時に0表示とエラーメッセージが出ることを確認する。  
  現状: **Partial**

- [ ] **Trends取得失敗時は直近成功キャッシュを優先表示**  
  確認方法: Trends API失敗時に直前成功系列が維持されることを確認する。  
  現状: **NG**

- [ ] **Trends取得失敗でキャッシュなしの場合は0ラインを描画**  
  確認方法: 初回失敗時にTrendsが空白でなく0ライン描画されることを確認する。  
  現状: **NG**

---

## Mobile

- [ ] **Filtersはモバイルで折りたたみ（⚙）を提供**  
  確認方法: モバイル幅でFiltersがデフォルト折りたたみで、トグル操作可能なことを確認する。  
  現状: **NG**

- [ ] **Trendsはモバイルで縦1カラム表示**  
  確認方法: モバイル幅でTrends各ブロックが単一カラム積み上げになることを確認する。  
  現状: **Partial**

- [ ] **モバイルでもデフォルト期間は7d**  
  確認方法: モバイル初期表示の期間タブが7dで選択されることを確認する。  
  現状: **NG**

- [ ] **横スクロール禁止のレスポンシブ表示**  
  確認方法: モバイル幅でページ全体に水平スクロールが発生しないことを確認する。  
  現状: **Partial**

---

## Data/API Contract

- [ ] **`/api/stats`はSnapshotの必須フィールドを返す**（`total_places`, `countries`, `cities`, `categories`, `chains`）  
  確認方法: APIレスポンスJSONに必須キーが存在し数値/オブジェクト型が正しいことを確認する。  
  現状: **OK**

- [ ] **`/api/stats`は更新時刻を返せる**（`generated_at`）  
  確認方法: APIレスポンスに`generated_at`が含まれ、UIにLast updatedが表示されることを確認する。  
  現状: **Partial**

- [ ] **Trends APIは時系列点を返す**（`points[].date`, `points[].delta`, `points[].total`）  
  確認方法: `/api/stats/trends`レスポンスの`points`配列に必須キーが揃うことを確認する。  
  現状: **OK**

- [ ] **Trends APIはv4.0前提データを満たす**（`dim_type=all/verification/asset`相当の3系列算出が可能）  
  確認方法: API設計/レスポンスでTotal・Verified・AcceptingAnyを同期間で取得できることを確認する。  
  現状: **NG**

- [ ] **Trends APIはキャッシュされる**（期間変更時のみ再取得に耐える）  
  確認方法: レスポンスヘッダにCache-Controlがあり、期間変更時のみ再フェッチする実装であることを確認する。  
  現状: **Partial**

- [ ] **Data update情報を表示**（Last updated / grain(1h|1d|1w) / 欠損時注記）  
  確認方法: Trends領域に更新時刻・粒度・欠損注記の3点が表示されることを確認する。  
  現状: **NG**

---

## 固定ルール（v4.0）

- [ ] **以下はv4.0で実装しない**（フィルタ推移 / 複合条件推移 / 都市別推移切替 / asset別推移切替）  
  確認方法: UI/APIに上記切替機能を追加していないことを確認する。  
  現状: **OK（未実装）**

- [ ] **最終完成条件**（Snapshot v3準拠 / Trends 24h-7d-30d-All / フィルタでTrends不変 / 0件でも壊れない / API失敗で真っ白にならない）  
  確認方法: E2E確認で5条件をすべて満たすことを確認する。  
  現状: **NG**
