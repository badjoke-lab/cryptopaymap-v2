# 📄 **stats-trends-v4.0.md — 推移データ管理仕様書（完全版 v4.0）**

**Status:** Final / Implementation-Ready
**Purpose:**
CryptoPayMap の **推移（Trend）データ**＝「日次スナップショット」「増減」「履歴管理」を
**DB で保持し、Stats v4 / v5（ダッシュボード）で使えるようにするための完全仕様書。**

---

# 1. 背景（v4 の役割）

Stats v2 / v3 は **“現在の状態”** の集計（カウント・クロステーブル）が中心。

v4 ではこれを拡張し：

### ✔ 日次スナップショット（Daily Snapshots）

### ✔ 全フィールドの増減（Diff）

### ✔ チェーン別 / カテゴリ別 / 国別の時系列推移

### ✔ 変化の発生源（増加理由 / 減少理由）

### ✔ v5（BI ダッシュボード）の前提データ

を全て扱う。

---

# 2. 全体構成（テーブル + ETL）

v4 の基礎は次の 3 テーブル：

```
stats_daily
stats_diff
history
```

ETL は以下の 3 ステップ：

```
1. 現在の stats_cache（v3）を取得
2. stats_daily に保存（スナップショット）
3. 前日との差分を計算 → stats_diff へ保存
```

---

# 3. テーブル仕様

---

## 3.1 stats_daily（必須）

**目的：**
毎日 1 回、**その日の全統計値** を保存する。

```
stats_daily (
  date DATE PRIMARY KEY,
  total_places INTEGER,
  total_countries INTEGER,
  total_cities INTEGER,

  category_breakdown JSONB,
  chain_breakdown JSONB,
  country_rank JSONB,
  city_rank JSONB,
  chain_country_matrix JSONB,
  chain_city_matrix JSONB,

  generated_at TIMESTAMP
);
```

**ルール：**

* 1 日 1 行
* 上書き禁止（既に行があったら無視 or エラー）
* データは stats_cache からそのままコピー

---

## 3.2 stats_diff（超重要）

**目的：**
**前日 → 今日の増減を機械的に記録する**
（ダッシュボードで「増加◯件」「減少◯件」を表示するため）

```
stats_diff (
  id SERIAL PRIMARY KEY,
  date DATE,           -- 今日
  field TEXT,          -- e.g. "total_places", "category:cafe", "chain:bitcoin"
  old_value JSONB,
  new_value JSONB,
  diff_value INTEGER,  -- +10, -3 など
  created_at TIMESTAMP
);
```

### diff の対象：

| 種類                   | 保存形式                 |
| -------------------- | -------------------- |
| total_places         | 数値                   |
| total_countries      | 数値                   |
| total_cities         | 数値                   |
| category_breakdown   | key ごとに差分保存          |
| chain_breakdown      | key ごとに差分保存          |
| country_rank         | key ごと               |
| city_rank            | key ごと               |
| chain_country_matrix | (country × chain) ごと |
| chain_city_matrix    | (city × chain) ごと    |

**全て “key ごと” に差分行が生成される。**

例（cafe が 92 → 95）：

```
field = "category:cafe"
old_value = 92
new_value = 95
diff_value = 3
```

---

## 3.3 history（v3 で定義済だが v4 で本格利用）

```
history (
  id SERIAL,
  place_id TEXT,
  updated_at TIMESTAMP,
  field TEXT,
  old_value TEXT,
  new_value TEXT
)
```

**用途：**
「増えた or 減った理由」を BI ダッシュボードで表示するためのデータ。

例：

* 店舗削除 → total_places が減少
* カテゴリ変更 → category_breakdown が変動
* 決済手段追加 → chain_breakdown が変動

---

# 4. ETL（推移）アルゴリズム

---

## 4.1 Step 1: stats_cache を読み込む

```
today = current_date
current = SELECT * FROM stats_cache ORDER BY generated_at DESC LIMIT 1;
```

---

## 4.2 Step 2: stats_daily に INSERT

```
INSERT INTO stats_daily (...)
VALUES (... current values ...)
ON CONFLICT DO NOTHING;
```

---

## 4.3 Step 3: 前日のスナップショット取得

```
previous = SELECT * FROM stats_daily
           WHERE date = today - 1
           LIMIT 1;
```

もし存在しなければ **初回実行** として diff 作成はスキップ。

---

## 4.4 Step 4: 差分の計算

### 4.4.1 単純数値

```
diff = current.total_places - previous.total_places
→ stats_diff に記録（diff_value = diff）
```

---

### 4.4.2 JSON breakdown 系（カテゴリ / チェーンなど）

アルゴリズム：

```
keys = set(previous.keys ∪ current.keys)

for each key:
    old = previous[key] or 0
    new = current[key] or 0
    if old != new:
        INSERT INTO stats_diff(field="category:<key>", old, new, diff=new-old)
```

---

### 4.4.3 クロステーブル（国×チェーン など）

```
for each country in union(previous, current):
  for each chain in union(previous[country], current[country]):
    same diff logic
```

---

## 4.5 Step 5: history との整合性（v4〜v5）

stats_diff には
**“何件増えた” は記録されるが “なぜ増えたか” は記録されない。**

そのため：

| 種類                 | 参照テーブル                      |
| ------------------ | --------------------------- |
| total_places の変動原因 | history(place 追加/削除)        |
| category の変動原因     | history(category 変更)        |
| chain の変動原因        | history(payment_accepts 変更) |

BI では `stats_diff + history` を組み合わせる。

---

# 5. API とデータ取得

v4 では stats ページに API が増える。

```
/api/stats/trends/daily
/api/stats/trends/diff
/api/stats/trends/chain
/api/stats/trends/category
```

返り値例：

```
{
  "date": "2025-11-25",
  "total_places": [ { "date": "...", "value": 500 }, ... ],
  "category": { "cafe": [...], "restaurant": [...] },
  "chain": { "bitcoin": [...], "evm-mainnet": [...] },
  "diff_today": [...]
}
```

---

# 6. UI（v4 対応 Stats）

v4 Stats ページは以下の UI を前提とする：

* 折れ線グラフ（Total Places）
* 棒グラフ（Category Trends）
* 積み上げ（Chain Trends）
* Country / City の増減ランキング
* 今日の差分（+◯件 / -◯件）

---

# 7. Cron（実行スケジュール）

```
毎日 00:05 UTC
```

理由：

* stats_cache の生成（v3）→ 当日中に完了している想定
* 日跨ぎ直後に安定して実行できる

---

# 8. 異常時の挙動

## 前日データがない

→ スナップショットのみ保存し、diff はスキップ。

## 形式不一致（JSON 崩れ）

→ その key の diff はスキップしログへ。

---

# 9. 将来拡張（v5 につながる部分）

Stats v5（BI ダッシュボード）では：

* 月次・週次集計
* chain dominance（支配率）
* 地域別普及速度
* 店舗カテゴリのトレンド分類（急上昇 / 安定 / 下降）
* 変化理由の自動要約（history → LLM）

この仕様がすべての基礎になる。

