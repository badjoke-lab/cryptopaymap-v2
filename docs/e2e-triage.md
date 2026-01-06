# E2E triage (Playwright)

## Run locally
PW_BASE_URL="http://127.0.0.1:3201" npm run test:map-smoke

## When CI fails
Artifacts are uploaded by GitHub Actions.
Use trace first:

npx playwright show-trace test-results/**/trace.zip
