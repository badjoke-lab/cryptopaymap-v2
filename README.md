# CryptoPayMap v2

Initial scaffold for the CryptoPayMap v2 Next.js application. This repository currently contains placeholder routes, configuration, and documentation stubs. Business logic and UI features will be implemented in subsequent tasks.

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

## Map Layout

- [Map layering rules (click-through prevention)](docs/map-layering.md)

## Operations: Retention (submission media)

Manual retention for submission media (proof/evidence expiry + unadopted gallery expiry):

```bash
# dry-run (list candidates)
node --import tsx scripts/retention/submissionMedia.ts --dry-run

# execute deletions
node --import tsx scripts/retention/submissionMedia.ts --execute
```

Defaults are proof=90 days, evidence=180 days, gallery=365 days. Override with
`RETENTION_PROOF_DAYS`, `RETENTION_EVIDENCE_DAYS`, `RETENTION_GALLERY_DAYS`, or
`--proof-days`, `--evidence-days`, `--gallery-days`.
