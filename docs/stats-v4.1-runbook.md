# Stats v4.1 Runbook（運用手順）

最終更新: 2026-02-27

---

## 1. 手動生成コマンド

### 1h（直近48h再計算）
```bash
pnpm tsx scripts/generate_stats_timeseries.ts --grain=1h --since-hours=48
```

### 1d（前日確定）
```bash
pnpm tsx scripts/generate_stats_timeseries.ts --grain=1d
```

### 1w（前週確定）
```bash
pnpm tsx scripts/generate_stats_timeseries.ts --grain=1w
```

---

## 2. Backfillコマンド（例: 90d）

### 日次90日
```bash
pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1d --days=90
```

### 週次52週
```bash
pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1w --weeks=52
```

### 時間48h
```bash
pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1h --hours=48
```

---

## 3. Gap checkコマンド

### 1h / all-all / 48h
```bash
pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1h --hours=48 --dim-type=all --dim-key=all --fail-if-gaps-above=0
```

### 1d / all-all / 90d
```bash
pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1d --days=90 --dim-type=all --dim-key=all --fail-if-gaps-above=0
```

### 1w / all-all / 52w
```bash
pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1w --weeks=52 --dim-type=all --dim-key=all --fail-if-gaps-above=0
```

---

## 4. 失敗時の調査ポイント

1. **Cron実行状況**
   - エンドポイント: `/api/internal/cron/stats-timeseries`
   - ログprefix: `[cron][stats-timeseries]`
   - 確認項目: `hourly/daily/weekly upserted`, `staleness`, `durationMs`。

2. **認可エラー**
   - `CRON_SECRET` 未設定または不一致で `403/500`。
   - `authorization: Bearer <secret>` または `x-cron-secret` を確認。

3. **DB関連**
   - `stats_timeseries` テーブル存在確認。
   - `generated_at` が更新されているか確認。
   - gap checkで欠損有無を確認。

4. **よくある原因**
   - Monday実行失敗でweekly未更新。
   - topN外キー要求時のfallback多発（仕様上の制限）。
   - DATABASE_URL/ネットワーク障害。

---

## 5. 「嘘禁止」表示ルール（運用再掲）

- fallback発生時は UI で必ず「代替キューブ表示中」を出す。
- cache利用時は「cached」であることと時刻を表示する。
- stale時は `meta.staleness.message` 相当の遅延注記を出す。
- データ未保存時は 0ライン表示 + 警告表示（真っ白禁止）。
- requested filters と used cube が異なる場合、dropped filters を必ず表示する。

