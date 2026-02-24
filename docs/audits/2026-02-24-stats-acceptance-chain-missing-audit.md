# Stats acceptance chain-missing audit (2026-02-24)

## Context
Production report indicated:
- `total_places ≈ 980`
- `top_chains_sum / matrix_sum ≈ 12`

Root-cause hypothesis: many `payment_accepts` rows have `asset` populated but `chain` empty.

## SQL used
```sql
WITH buckets AS (
  SELECT
    CASE
      WHEN NULLIF(BTRIM(asset), '') IS NOT NULL AND NULLIF(BTRIM(chain), '') IS NULL THEN 'asset_present_chain_empty'
      WHEN NULLIF(BTRIM(asset), '') IS NULL AND NULLIF(BTRIM(chain), '') IS NOT NULL THEN 'chain_present_asset_empty'
      WHEN NULLIF(BTRIM(asset), '') IS NOT NULL AND NULLIF(BTRIM(chain), '') IS NOT NULL THEN 'both_present'
      ELSE 'both_empty'
    END AS bucket,
    place_id
  FROM payment_accepts
)
SELECT bucket, COUNT(*)::bigint AS row_count, COUNT(DISTINCT place_id)::bigint AS distinct_places
FROM buckets
GROUP BY bucket
ORDER BY bucket;
```

```sql
SELECT COUNT(DISTINCT place_id)::bigint AS places_asset_present_chain_empty
FROM payment_accepts
WHERE NULLIF(BTRIM(asset), '') IS NOT NULL
  AND NULLIF(BTRIM(chain), '') IS NULL;
```

```sql
SELECT COUNT(DISTINCT place_id)::bigint AS places_both_present
FROM payment_accepts
WHERE NULLIF(BTRIM(asset), '') IS NOT NULL
  AND NULLIF(BTRIM(chain), '') IS NOT NULL;
```

## Recorded numbers
- Could not execute in this container because `DATABASE_URL` is not configured.
- API behavior change in this PR ensures missing-chain records are counted via `chain='unknown'`.
