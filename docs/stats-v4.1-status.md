# Stats v4.1 Status（運用者向け1ページ）

## 現在状態

- 状態: v4.1（PR #313反映後）
- 判定: DONE（コード監査ベース）
- 補足: 実環境E2E（/stats表示・360px）は運用手順で最終目視推奨

## Cron更新頻度

- Vercel Cron: `daily 1本`（`/api/internal/cron/stats-timeseries`）
- daily実行内容:
  - hourly: 直近48h再計算
  - daily: 前日確定
  - weekly: 月曜UTCのみ

## Backfill手順（代表）

- 日次90日:
  - `pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1d --days=90`
- 週次52週:
  - `pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1w --weeks=52`
- 時間48h:
  - `pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1h --hours=48`

詳細: `docs/stats-v4.1-runbook.md`

## Gap check手順（代表）

- 1h / all-all / 48h:
  - `pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1h --hours=48 --dim-type=all --dim-key=all --fail-if-gaps-above=0`
- 1d / all-all / 90d:
  - `pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1d --days=90 --dim-type=all --dim-key=all --fail-if-gaps-above=0`
- 1w / all-all / 52w:
  - `pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1w --weeks=52 --dim-type=all --dim-key=all --fail-if-gaps-above=0`

## 障害時の最短復旧（最短ルート）

1. cronログ確認（`[cron][stats-timeseries]`）
2. 認可確認（`CRON_SECRET` / Bearer / `x-cron-secret`）
3. 手動再実行（hourly→daily→必要時weekly）
   - `pnpm tsx scripts/generate_stats_timeseries.ts --grain=1h --since-hours=48`
   - `pnpm tsx scripts/generate_stats_timeseries.ts --grain=1d`
   - `pnpm tsx scripts/generate_stats_timeseries.ts --grain=1w`
4. gap check 0件確認
5. `/api/stats/trends` を curl し `meta.has_data`, `meta.fallback`, `meta.staleness` を確認

詳細: `docs/stats-v4.1-runbook.md`, `docs/stats-v4.1-final-verification-report.md`
