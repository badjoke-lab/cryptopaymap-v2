# Submission smoke test (owner/community/report)

This doc describes the curl-only workflow implemented in `scripts/cpm_submit_smoke_test.sh`.

## Copy/paste (local)

```bash
BASE=http://localhost:3000 \
INTERNAL_KEY=your_internal_key \
bash scripts/cpm_submit_smoke_test.sh
```

Expected:
- owner/community submissions return `id`, `status`, `kind` with 201.
- approve + promote return 200 and include `placeId` + `mode`.
- `GET /api/places` shows the new place and `GET /api/places/by-id` returns details.
- report submissions can be approved and confirmed via `GET /api/internal/submissions/:id`.

## Production-safe validation (no data pollution)

Use dry-run mode so no DB writes occur and the same script can run end-to-end.

```bash
BASE=https://your-production-host \
INTERNAL_KEY=your_internal_key \
DRY_RUN=1 \
bash scripts/cpm_submit_smoke_test.sh
```

Dry-run behavior:
- submission endpoints validate payloads and return `status: validated` plus a dry-run id.
- internal approve/promote endpoints echo simulated results (no DB writes).
- places list/detail endpoints return dry-run placeholders for the provided `placeId`.
