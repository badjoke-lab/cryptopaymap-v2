# CryptoPayMap v2 — Submit specs vs repo audit (2026-01-24)

Authoritative specs reviewed:
- `docs/submissions.md`
- `docs/state-machine-site.md`
- `docs/state-machine-submissions.md`
- `docs/api.md`
- `docs/ops.md`
- `docs/policies.md`
- `docs/media-storage.md`

---

## A. Summary

**Overall status: 🔴 Red (spec and implementation are materially misaligned).**

The current implementation appears to follow an older “single-page JSON submit + immediate place creation on approve” model. The authoritative specs require a confirm-step submit flow, multipart media ingestion, R2-backed storage, and public/internal media delivery endpoints. None of the media requirements are implemented yet, and several submit/internal routes differ from spec.

### Top 10 mismatches by severity

1. **Submit flow sends final POST from `/submit` instead of confirm pages.**  
   Spec requires confirm-only final submission with `/submit/{kind}/confirm` routes and `/submit/done`. See `app/submit/page.tsx` POSTing directly to `/api/submissions`.【F:app/submit/page.tsx†L126-L163】
2. **Required submit routes are missing.**  
   `/submit/owner`, `/submit/community`, `/submit/report`, their `/confirm` pages, and `/submit/done` are not present under `app/submit/**`.
3. **`report` kind is not supported.**  
   `SubmissionKind` is limited to `"owner" | "community"`, and normalization rejects any other kind.【F:lib/submissions.ts†L6-L16】【F:lib/submissions.ts†L244-L251】
4. **`POST /api/submissions` accepts JSON, not `multipart/form-data`.**  
   The handler calls `request.json()` and rejects non-JSON requests.【F:lib/submissions.ts†L481-L489】
5. **No submit media pipeline exists (limits, file type/size validation, EXIF strip, WebP conversion, resize).**  
   There is no media parsing or file validation logic in the submissions handler; it only normalizes JSON fields and inserts into `submissions`.【F:lib/submissions.ts†L508-L531】【F:lib/submissions.ts†L360-L421】
6. **No R2 integration or required R2 environment variables referenced in code.**  
   Repo-wide search shows `R2_` only appears in docs, not in implementation.
7. **Media delivery endpoints are missing.**  
   Neither `/api/media/submissions/[submissionId]/gallery/[mediaId]` nor `/api/internal/media/submissions/[submissionId]/[kind]/[mediaId]` exist under `app/api/**`.
8. **Internal APIs do not implement authn/authz guards (401/403).**  
   Internal submission routes only check DB availability and proceed without authorization checks.【F:app/api/internal/submissions/route.ts†L18-L31】【F:app/api/internal/submissions/[id]/route.ts†L9-L20】
9. **Approve action performs promote-like side effects immediately.**  
   Spec requires `approve` to set status/timestamps and `promote` to reflect into `places` and related tables. Current approve handler inserts into `places` and `payment_accepts` and sets `published_place_id` in the same action.【F:app/api/internal/submissions/[id]/approve/route.ts†L160-L177】【F:app/api/internal/submissions/[id]/approve/route.ts†L185-L213】
10. **Internal promote route required by spec is missing; a public promote route exists instead.**  
    Spec expects `POST /api/internal/submissions/[id]/promote`. Implementation provides `POST /api/submissions/[id]/promote` with no internal guard and a file-based submission source.【F:app/api/submissions/[id]/promote/route.ts†L28-L41】【F:app/api/submissions/[id]/promote/route.ts†L138-L145】

---

## B. Spec-by-spec checklist

This section evaluates each authoritative spec theme against current repo evidence.

### B1. Submit UI/UX (`docs/submissions.md`, `docs/state-machine-submissions.md`)

**Spec highlights (source of truth):**
- Flow: `/submit` → `/submit/{kind}` → `/submit/{kind}/confirm` → `/submit/done`.【F:docs/submissions.md†L95-L108】
- Final POST occurs only on confirm pages.【F:docs/submissions.md†L101-L105】【F:docs/state-machine-submissions.md†L112-L116】
- Kinds limited to `owner` / `community` / `report`.【F:docs/state-machine-submissions.md†L11-L13】

**Audit results:**
- ❌ Missing kind-specific routes and confirm pages: only `app/submit/page.tsx` exists under `app/submit/**`.
- ❌ Final submission occurs on `/submit` instead of confirm pages via direct POST to `/api/submissions`.【F:app/submit/page.tsx†L126-L163】
- ❌ `report` kind is not available in type definitions (`SubmissionKind` excludes `report`).【F:lib/submissions.ts†L6-L16】
- ⚠️ Basic client validation exists, but it enforces the older field model (e.g., `verificationRequest`) rather than the spec’s submission model separation.【F:app/submit/page.tsx†L106-L124】【F:lib/submissions.ts†L244-L251】

### B2. Public submit API (`docs/api.md`, `docs/submissions.md`)

**Spec highlights:**
- `POST /api/submissions` uses `multipart/form-data` with `payload` JSON + images.【F:docs/api.md†L346-L356】【F:docs/submissions.md†L190-L196】
- Media limits by kind (owner/community/report).【F:docs/api.md†L354-L357】
- Validate types (jpeg/png/webp) and size ≤ 2MB.【F:docs/api.md†L365-L367】
- R2 storage, no DB binaries, and persistent app endpoints in `submission_media.url`.【F:docs/submissions.md†L221-L226】【F:docs/submissions.md†L239-L250】
- 202 degraded fallback stores to `data/submissions-pending.ndjson`.【F:docs/submissions.md†L204-L208】

**Audit results:**
- ❌ Content type mismatch: handler expects JSON via `request.json()`; multipart requests would be rejected.【F:lib/submissions.ts†L481-L489】
- ❌ No media handling or validation is implemented in the submit pipeline; only JSON normalization and DB insert occur.【F:lib/submissions.ts†L508-L531】【F:lib/submissions.ts†L360-L421】
- ❌ `report` kind is unsupported at normalization/type level.【F:lib/submissions.ts†L6-L16】【F:lib/submissions.ts†L244-L251】
- ✅ Degraded fallback to NDJSON exists when DB failures are detected at the route handler layer.【F:app/api/submissions/route.ts†L26-L38】【F:app/api/submissions/route.ts†L72-L96】
- ⚠️ The 202 response does not include a `degraded: true` flag as specified in `docs/api.md`.【F:app/api/submissions/route.ts†L86-L95】

### B3. Media APIs and URL policy (`docs/api.md`, `docs/media-storage.md`, `docs/policies.md`)

**Spec highlights:**
- Public gallery endpoint: `GET /api/media/submissions/[submissionId]/gallery/[mediaId]`.【F:docs/api.md†L422-L427】【F:docs/media-storage.md†L42-L44】
- Internal proof/evidence endpoint: `GET /api/internal/media/submissions/[submissionId]/[kind]/[mediaId]` with auth and `no-store`.【F:docs/api.md†L431-L436】【F:docs/media-storage.md†L45-L55】
- `submission_media.url` must store app endpoints, and signed URLs are forbidden.【F:docs/policies.md†L64-L71】

**Audit results:**
- ❌ No media routes exist under `app/api/media/**` or `app/api/internal/media/**`.
- ❌ No `submission_media` handling exists in the current submit or internal pipelines.
- ⚠️ Signed URL violations are not directly observable because there is no media URL issuance at all.

### B4. Internal review APIs and UI (`docs/api.md`, `docs/state-machine-submissions.md`, `docs/submissions.md`)

**Spec highlights:**
- Internal routes require authn/authz (401/403).【F:docs/api.md†L56-L57】【F:docs/api.md†L86-L87】
- Internal flow supports approve/reject for all kinds, and promote only for owner/community.【F:docs/state-machine-submissions.md†L14-L17】【F:docs/state-machine-submissions.md†L198-L202】
- Promote is a distinct action after approval; approve should not reflect into places/media directly.【F:docs/state-machine-submissions.md†L135-L137】【F:docs/submissions.md†L271-L273】

**Audit results:**
- ❌ Missing required internal route: `app/api/internal/submissions/[id]/promote/route.ts` does not exist.
- ❌ Internal auth guard is absent in internal submission routes; there are no checks that would return 401/403.【F:app/api/internal/submissions/route.ts†L18-L31】【F:app/api/internal/submissions/[id]/route.ts†L9-L20】
- ❌ Approve performs promote-like side effects by inserting into `places` and `payment_accepts` and setting `published_place_id`, which conflicts with the spec’s separation between approve and promote.【F:app/api/internal/submissions/[id]/approve/route.ts†L160-L177】【F:app/api/internal/submissions/[id]/approve/route.ts†L185-L213】
- ❌ Internal UI route `/internal` is missing; the list is at `/internal/submissions` instead.
- ❌ Internal UI does not display `submission_media` by kind, and it offers no promote action at all.【F:app/internal/submissions/SubmissionDetailClient.tsx†L165-L176】【F:app/internal/submissions/SubmissionDetailClient.tsx†L334-L373】

### B5. R2 integration and ops alignment (`docs/ops.md`, `docs/media-storage.md`)

**Spec highlights:**
- Submit media must be stored in R2, not DB binaries.【F:docs/ops.md†L236-L239】【F:docs/media-storage.md†L17-L19】
- R2 environment variables are required (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, etc.).【F:docs/ops.md†L241-L248】

**Audit results:**
- ❌ No R2 helper libraries or R2 env vars are referenced in implementation.
- ❌ No media storage abstraction is present for submissions.

---

## C. Route map

### C1. Submit UI routes found under `app/submit/**`

**Found:**
- `GET /submit` via `app/submit/page.tsx`.【F:app/submit/page.tsx†L64-L72】

**Expected but missing:**
- `/submit/owner`
- `/submit/owner/confirm`
- `/submit/community`
- `/submit/community/confirm`
- `/submit/report`
- `/submit/report/confirm`
- `/submit/done`

**Notable divergence:**
- `/submit` currently contains the full form and performs the final POST directly.【F:app/submit/page.tsx†L126-L163】

### C2. API routes found under `app/api/**`

**Found submissions-related routes:**
- `POST /api/submissions`.【F:app/api/submissions/route.ts†L40-L48】
- Legacy kind routes:
  - `POST /api/submissions/owner`.【F:app/api/submissions/owner/route.ts†L3-L5】
  - `POST /api/submissions/community`.【F:app/api/submissions/community/route.ts†L3-L5】
- File-based promote and status routes:
  - `POST /api/submissions/[id]/promote`.【F:app/api/submissions/[id]/promote/route.ts†L28-L41】
  - `PATCH /api/submissions/[id]/status`.【F:app/api/submissions/[id]/status/route.ts†L12-L21】

**Found internal routes:**
- `GET /api/internal/submissions`.【F:app/api/internal/submissions/route.ts†L18-L31】
- `GET /api/internal/submissions/[id]`.【F:app/api/internal/submissions/[id]/route.ts†L9-L20】
- `POST /api/internal/submissions/[id]/approve`.【F:app/api/internal/submissions/[id]/approve/route.ts†L107-L115】
- `POST /api/internal/submissions/[id]/reject`.【F:app/api/internal/submissions/[id]/reject/route.ts†L9-L16】
- Additional (not spec’d here but present): `GET /api/internal/submissions/[id]/history`.【F:app/api/internal/submissions/[id]/history/route.ts†L8-L16】

**Expected but missing (per specs):**
- `GET /api/media/submissions/[submissionId]/gallery/[mediaId]`
- `GET /api/internal/media/submissions/[submissionId]/[kind]/[mediaId]`
- `POST /api/internal/submissions/[id]/promote`

### C3. Internal UI routes found under `app/internal/**`

**Found:**
- `/internal/submissions` list page.【F:app/internal/submissions/page.tsx†L4-L16】
- `/internal/submissions/[id]` detail page.【F:app/internal/submissions/[id]/page.tsx†L4-L16】

**Expected but missing:**
- `/internal` top-level route (spec state machine refers to `/internal`).

---

## D. Media storage compliance

### D1. R2 usage
- **R2 usage in code: ❌ No evidence found.**  
  Repo search for `R2_` and `r2` references returns only documentation, not implementation.

### D2. Public/internal media split
- **Public/internal split implemented: ❌ No.**  
  The required media route trees under `app/api/media/**` and `app/api/internal/media/**` are absent.

### D3. URL issuance policy (`submission_media.url`)
- **Complies: ❌ Not implemented.**  
  There is no `submission_media` pipeline in the current code, so the required app-endpoint URL issuance policy is not in place.

### D4. Internal cache headers (`no-store`)
- **Complies: ❌ Not implemented.**  
  The internal media endpoint does not exist, so `Cache-Control: no-store` is not enforced.

---

## E. Concrete gap list (actionable, do not implement in this audit)

Each gap references the authoritative spec and current repo evidence.

- [GAP-01] Split submit UI into kind-specific draft + confirm + done routes.
  - Spec reference: Submit UI flow and confirm-only POST.【F:docs/submissions.md†L95-L108】
  - Current state: Only `/submit` exists and it performs the final POST itself.【F:app/submit/page.tsx†L126-L163】
  - Required fix: Implement `/submit/{kind}`, `/submit/{kind}/confirm`, and `/submit/done`; move final POST to confirm pages only.
  - Risk: Correctness / policy drift.

- [GAP-02] Add `report` kind support end-to-end.
  - Spec reference: kinds fixed to owner/community/report.【F:docs/state-machine-submissions.md†L11-L13】
  - Current state: `SubmissionKind` excludes `report`, and normalization rejects non-owner/community kinds.【F:lib/submissions.ts†L6-L16】【F:lib/submissions.ts†L244-L251】
  - Required fix: Extend types, validation, and storage to support `report` and its evidence media rules.
  - Risk: Correctness / spec non-compliance.

- [GAP-03] Migrate `POST /api/submissions` to `multipart/form-data`.
  - Spec reference: multipart payload + images is required.【F:docs/api.md†L346-L356】
  - Current state: Handler requires JSON via `request.json()` and will reject multipart submissions.【F:lib/submissions.ts†L481-L489】
  - Required fix: Parse multipart, extract `payload` JSON, and handle attached files per kind.
  - Risk: Correctness / inability to meet media requirements.

- [GAP-04] Implement media validation and kind-specific limits on the server.
  - Spec reference: file type/size constraints and kind-specific counts.【F:docs/api.md†L365-L368】【F:docs/api.md†L354-L357】
  - Current state: No file handling or file validation exists in the submit pipeline.【F:lib/submissions.ts†L508-L531】
  - Required fix: Enforce allowed MIME types, ≤2MB size, and per-kind file count limits.
  - Risk: Security / free-ops / correctness.

- [GAP-05] Implement media processing and storage (EXIF strip + WebP + resize) backed by R2.
  - Spec reference: required upload hygiene and R2 storage policy.【F:docs/submissions.md†L232-L237】【F:docs/ops.md†L236-L239】
  - Current state: No media processing/storage pipeline exists; no R2 integration present in code.
  - Required fix: Add storage abstraction, process images on upload, store to R2 using the documented key convention, and persist app endpoints.
  - Risk: Security / free-ops / privacy.

- [GAP-06] Add media delivery endpoints with public/internal separation and caching rules.
  - Spec reference: required media routes and internal no-store policy.【F:docs/api.md†L422-L427】【F:docs/api.md†L431-L436】
  - Current state: No corresponding route handlers exist under `app/api/media/**` or `app/api/internal/media/**`.
  - Required fix: Implement both route trees, including auth guard on internal endpoints and cache headers.
  - Risk: Security / privacy / correctness.

- [GAP-07] Add authn/authz guards to all internal APIs.
  - Spec reference: internal APIs must enforce 401/403.【F:docs/api.md†L56-L57】【F:docs/api.md†L86-L87】
  - Current state: Internal routes check DB availability but do not check authorization before returning data or mutating state.【F:app/api/internal/submissions/route.ts†L18-L31】【F:app/api/internal/submissions/[id]/route.ts†L9-L20】
  - Required fix: Add a shared internal auth guard and apply it consistently.
  - Risk: Security.

- [GAP-08] Separate approve from promote; do not create places on approve.
  - Spec reference: approve/reject update submission status; promote performs place reflection later.【F:docs/state-machine-submissions.md†L135-L137】【F:docs/submissions.md†L271-L273】
  - Current state: Approve creates a place, writes payment accepts, and sets `published_place_id` immediately.【F:app/api/internal/submissions/[id]/approve/route.ts†L160-L177】【F:app/api/internal/submissions/[id]/approve/route.ts†L205-L213】
  - Required fix: Restrict approve to status/timestamps/review metadata; move reflection to promote.
  - Risk: Correctness / moderation workflow drift.

- [GAP-09] Implement `POST /api/internal/submissions/[id]/promote` and remove/lock down public promote.
  - Spec reference: promote is internal-only and applies only to owner/community.【F:docs/api.md†L83-L84】【F:docs/state-machine-submissions.md†L144-L146】
  - Current state: Internal promote route is missing; a public promote route exists at `/api/submissions/[id]/promote`.【F:app/api/submissions/[id]/promote/route.ts†L28-L41】
  - Required fix: Add internal promote route with auth guard and kind/status checks; deprecate or guard the public promote route.
  - Risk: Security / correctness.

- [GAP-10] Update internal UI to include promote action and media review surfaces.
  - Spec reference: internal detail must show submission media by kind and promote button only for owner/community.【F:docs/state-machine-submissions.md†L192-L202】
  - Current state: Internal detail UI shows no submission media and no promote action.【F:app/internal/submissions/SubmissionDetailClient.tsx†L165-L176】【F:app/internal/submissions/SubmissionDetailClient.tsx†L334-L373】
  - Required fix: Add media sections and promote action gated by kind/status.
  - Risk: Correctness / moderation efficiency.

---

## F. Appendix

### F1. Paths searched
- `docs/**` (authoritative specs)
- `app/submit/**`
- `app/api/submissions/**`
- `app/api/internal/submissions/**`
- `app/api/media/**`
- `app/api/internal/media/**`
- `lib/**`

### F2. ripgrep / terminal queries used

```bash
rg --files -g "**/AGENTS.md"
ls docs
nl -ba docs/submissions.md
nl -ba docs/state-machine-site.md
nl -ba docs/state-machine-submissions.md
nl -ba docs/api.md
nl -ba docs/ops.md
nl -ba docs/policies.md
nl -ba docs/media-storage.md
rg --files app/submit app/api/internal app/api/media app/api/submissions lib | head -n 200
for f in app/submit/page.tsx app/submit/owner/page.tsx app/submit/owner/confirm/page.tsx app/submit/community/page.tsx app/submit/community/confirm/page.tsx app/submit/report/page.tsx app/submit/report/confirm/page.tsx app/submit/done/page.tsx; do echo "--- $f"; if [ -f "$f" ]; then nl -ba "$f" | sed -n '1,200p'; else echo "MISSING"; fi; done
rg --files app/internal
nl -ba app/internal/submissions/page.tsx | sed -n '1,220p'
nl -ba app/internal/submissions/PendingSubmissionsClient.tsx | sed -n '1,220p'
nl -ba app/internal/submissions/SubmissionDetailClient.tsx | sed -n '1,260p'
nl -ba app/internal/submissions/SubmissionDetailClient.tsx | sed -n '260,560p'
nl -ba app/api/submissions/route.ts | sed -n '1,260p'
nl -ba lib/submissions.ts | sed -n '1,260p'
nl -ba lib/submissions.ts | sed -n '260,620p'
nl -ba lib/submissions.ts | sed -n '420,560p'
for f in app/api/internal/submissions/route.ts app/api/internal/submissions/[id]/route.ts app/api/internal/submissions/[id]/approve/route.ts app/api/internal/submissions/[id]/reject/route.ts app/api/internal/submissions/[id]/promote/route.ts app/api/internal/submissions/[id]/history/route.ts; do echo "--- $f"; if [ -f "$f" ]; then nl -ba "$f" | sed -n '1,220p'; else echo "MISSING"; fi; done
nl -ba app/api/internal/submissions/[id]/route.ts | sed -n '1,220p'
nl -ba app/api/internal/submissions/[id]/approve/route.ts | sed -n '1,240p'
nl -ba app/api/internal/submissions/[id]/approve/route.ts | sed -n '240,360p'
nl -ba app/api/internal/submissions/[id]/reject/route.ts | sed -n '1,240p'
for f in app/api/submissions/owner/route.ts app/api/submissions/community/route.ts app/api/submissions/[id]/status/route.ts app/api/submissions/[id]/promote/route.ts; do echo "--- $f"; nl -ba "$f" | sed -n '1,200p'; done
rg --files app/api | sort
[ -d app/api/media ] && echo "app/api/media exists" || echo "app/api/media missing"; [ -d app/api/internal/media ] && echo "app/api/internal/media exists" || echo "app/api/internal/media missing"
rg "R2|r2|S3|bucket|submission_media|media/submissions|internal/media" -n
rg --files -g "lib/**/*r2*.ts" -g "lib/**/*storage*.ts"
rg "R2_" -n
nl -ba docs/submissions.md | sed -n '93,115p'
nl -ba docs/submissions.md | sed -n '150,182p'
nl -ba docs/submissions.md | sed -n '190,252p'
nl -ba docs/submissions.md | sed -n '266,288p'
nl -ba docs/api.md | sed -n '52,88p'
nl -ba docs/api.md | sed -n '344,380p'
nl -ba docs/api.md | sed -n '418,438p'
nl -ba docs/ops.md | sed -n '232,276p'
```
