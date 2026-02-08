# Submission smoke test (owner/community/report)

This doc describes the curl-only workflow implemented in `scripts/cpm_submit_smoke_test.sh`.

## Canonical entry point

The canonical submission entry point is `POST /api/submissions` (multipart form-data with a `payload` JSON field). Legacy JSON endpoints (`/api/submissions/owner`, `/community`, `/report`) are compatible with both new and old payload shapes, but the smoke test uses the canonical endpoint.

If you see `400 Required`, it usually means the payload shape is wrong. Use the canonical curl form:

```bash
curl -F 'payload={"kind":"owner","name":"Example","country":"US","city":"Austin","address":"100 Congress Ave","category":"cafe","acceptedChains":["btc"],"ownerVerification":"domain","contactEmail":"me@example.com"}' \
  http://localhost:3000/api/submissions
```

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
- report submissions can be approved and confirmed via `GET /api/internal/submissions/:id`; promote must return a 4xx with a reason.

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
