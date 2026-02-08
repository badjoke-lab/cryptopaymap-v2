# submit smoke test (curl-only)

`scripts/cpm_submit_smoke_test.sh` runs the owner/community/report submission → approve → promote (owner/community) → places verification flow using curl only. It works for both local and prod by switching `BASE_URL`.

## Prerequisites

* Internal basic auth credentials:
  * `INTERNAL_USER`
  * `INTERNAL_PASS`

## Run (local)

```bash
BASE_URL=http://localhost:3000 \
INTERNAL_USER=your_internal_user \
INTERNAL_PASS=your_internal_pass \
bash scripts/cpm_submit_smoke_test.sh
```

## Run (prod)

```bash
BASE_URL=https://your-prod-domain.example \
INTERNAL_USER=your_internal_user \
INTERNAL_PASS=your_internal_pass \
bash scripts/cpm_submit_smoke_test.sh
```

## What the script checks

* Owner flow: submit → approve → promote → places list includes the name → fetch by placeId.
* Community flow: same as owner.
* Report flow: submit → approve → confirm approved status via `GET /api/internal/submissions/:id`, and confirm promote is rejected with 409.

## Notes

* The script uses `GET /api/places/by-id?id=...` to safely fetch place details with `cpm:...` IDs.
* Internal endpoints accept empty bodies; the script sends no body for approve/promote.
