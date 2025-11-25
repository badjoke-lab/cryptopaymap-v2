# 📄 **db-v3.0.md — DB 完全仕様（PostgreSQL + PostGIS）**

---

## **1. Overview**

CryptoPayMap v2 のデータベースは、
**Neon（PostgreSQL 15 + PostGIS）** 上で以下の 8 テーブルを持つ。

目的は：

* 堅牢で壊れない
* 将来の拡張（v3=クロステーブル、v4=履歴、v5=BI）に対応
* OSM流入・ユーザー申請・手動モデレーションのすべてを受け止める
* Codex が安全に CRUD API を生成できる

---

## **2. テーブル一覧（8 tables）**

```
places
verifications
payments
payment_accepts
socials
media
categories  ※（v3.1 以降は未使用、互換維持のため残す）
history  ※（stats-trends 用、v4 で運用開始）
```

---

## **3. places（メインテーブル）**

* 世界中の店舗情報の「本体」
* 緯度経度は PostGIS geometry(Point, 4326)
* about / amenities / hours などはここで保持

### **DDL**

```sql
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT,
  category TEXT,
  category_source TEXT,
  category_confidence REAL,

  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,

  hours TEXT,
  about TEXT,
  amenities TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **ポイント**

* `geom` は必ず STORED で生成
* category は string（OSM対策）
* about は Owner/Community の時のみ 300〜600 文字

---

## **4. verifications（検証レベル）**

### **役割**

* owner / community / directory / unverified
* verified 日付、submitted、review、sources を JSONB で持つ

### **DDL**

```sql
CREATE TABLE verifications (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN ('owner','community','directory','unverified')),

  last_checked TIMESTAMPTZ,
  last_verified TIMESTAMPTZ,

  submitted JSONB,
  review JSONB,
  sources JSONB,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## **5. payments（支払い設定の親）**

```sql
CREATE TABLE payments (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  preferred TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## **6. payment_accepts（asset/chain/method/processor）**

正規化された受入通貨行。

```sql
CREATE TABLE payment_accepts (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,

  asset TEXT NOT NULL,
  chain TEXT NOT NULL,
  method TEXT,
  processor TEXT,
  note TEXT,

  UNIQUE(place_id, asset, chain, method)
);
```

---

## **7. socials（SNS / Web / Contacts）**

```sql
CREATE TABLE socials (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT,
  handle TEXT,
  UNIQUE(place_id, platform, url, handle)
);
```

* platform: instagram / facebook / x / tiktok / etc

---

## **8. media（画像ギャラリー）**

```sql
CREATE TABLE media (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  credit TEXT
);
```

制約：

* Owner: 最大 8
* Community: 最大 4
* Directory/Unverified: 0（ETL/CI で除去）

---

## **9. history（推移管理 v4.0 用）**

v4 で使うが、v3 の段階で必ずテーブルだけは作っておく。

```sql
CREATE TABLE history (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

用途：

* stats-trends（推移）
* stats-dashboard（国別・都市別の時系統）
* owner → community など status 移動の記録

---

## **10. インデックス最適化**

```sql
CREATE INDEX idx_places_geom ON places USING GIST (geom);
CREATE INDEX idx_places_category ON places (category);
CREATE INDEX idx_verifications_status ON verifications (status);
CREATE INDEX idx_payment_accepts_place ON payment_accepts (place_id);
```

---

## **11. バックフィル / ETL 対応（data-etl-v3 と連動）**

* JSON → places / verifications / payments / accepts / socials / media の完全分解
* 自動で directory の画像を削除
* asset / chain の正規化
* category の揺れ補正（lowercase → canonical）
* hours の形式をそのまま通す（構造化は v4）

---

## **12. 今後の拡張**

* v4: history を本運用
* v5: materialized view での BI
* v3.1: category テーブルを削除可能
* v6: AI 推奨カテゴリのスコア保存（optional）

---
