#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-"http://localhost:3000"}
INTERNAL_KEY=${INTERNAL_KEY:-""}
DRY_RUN=${DRY_RUN:-""}

if [[ -z "${BASE}" ]]; then
  echo "BASE is required" >&2
  exit 1
fi

request() {
  local method=$1
  local url=$2
  local data=${3:-}
  local headers=()
  if [[ -n "${INTERNAL_KEY}" ]]; then
    headers+=("-H" "x-cpm-internal-key: ${INTERNAL_KEY}")
  fi
  if [[ -n "${data}" ]]; then
    headers+=("-H" "Content-Type: application/json")
  fi
  if [[ -n "${data}" ]]; then
    curl -sS -X "${method}" "${url}" "${headers[@]}" -d "${data}" -w "\n%{http_code}"
  else
    curl -sS -X "${method}" "${url}" "${headers[@]}" -w "\n%{http_code}"
  fi
}

get_status() {
  echo "$1" | tail -n1
}

get_body() {
  echo "$1" | sed '$d'
}

extract_field() {
  local body=$1
  local field=$2
  echo "${body}" | sed -n "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n1
}

require_non_empty() {
  local value=$1
  local label=$2
  if [[ -z "${value}" ]]; then
    echo "Missing ${label} in response" >&2
    exit 1
  fi
}

urlencode_basic() {
  echo "$1" | sed -e 's/%/%25/g' -e 's/ /%20/g' -e 's/:/%3A/g'
}

submit_owner_payload() {
  cat <<JSON
{
  "kind": "owner",
  "name": "${OWNER_NAME}",
  "country": "US",
  "city": "Austin",
  "address": "100 Congress Ave",
  "category": "cafe",
  "acceptedChains": ["btc"],
  "ownerVerification": "domain",
  "contactEmail": "owner@example.com",
  "contactName": "Owner Test",
  "lat": 30.2672,
  "lng": -97.7431,
  "notesForAdmin": "Smoke test owner"
}
JSON
}

submit_community_payload() {
  cat <<JSON
{
  "kind": "community",
  "name": "${COMMUNITY_NAME}",
  "country": "US",
  "city": "Austin",
  "address": "200 Congress Ave",
  "category": "restaurant",
  "acceptedChains": ["btc"],
  "contactEmail": "community@example.com",
  "contactName": "Community Test",
  "communityEvidenceUrls": ["https://example.com/proof"],
  "lat": 30.2682,
  "lng": -97.7441,
  "notesForAdmin": "Smoke test community"
}
JSON
}

submit_report_payload() {
  cat <<JSON
{
  "kind": "report",
  "name": "${REPORT_NAME}",
  "country": "US",
  "city": "Austin",
  "address": "300 Congress Ave",
  "category": "retail",
  "reportAction": "hide",
  "reportReason": "Incorrect info",
  "reportDetails": "Smoke test report",
  "contactEmail": "report@example.com"
}
JSON
}

SUBMIT_QUERY=""
INTERNAL_QUERY=""
PLACES_QUERY=""
PLACE_DETAIL_QUERY=""
if [[ -n "${DRY_RUN}" ]]; then
  SUBMIT_QUERY="?dryRun=1"
  INTERNAL_QUERY="?dryRun=1"
  PLACES_QUERY="dryRun=1"
  PLACE_DETAIL_QUERY="&dryRun=1"
fi

RUN_ID=$(date +%s)
OWNER_NAME="[SMOKE] Owner ${RUN_ID}"
COMMUNITY_NAME="[SMOKE] Community ${RUN_ID}"
REPORT_NAME="[SMOKE] Report ${RUN_ID}"

# Owner submission
owner_response=$(request POST "${BASE}/api/submissions/owner${SUBMIT_QUERY}" "$(submit_owner_payload)")
owner_status=$(get_status "${owner_response}")
owner_body=$(get_body "${owner_response}")
if [[ "${owner_status}" != "201" && "${owner_status}" != "200" ]]; then
  echo "Owner submit failed: ${owner_body}" >&2
  exit 1
fi
owner_id=$(extract_field "${owner_body}" "id")
owner_kind=$(extract_field "${owner_body}" "kind")
require_non_empty "${owner_id}" "owner id"
require_non_empty "${owner_kind}" "owner kind"

# Owner approve
owner_approve=$(request POST "${BASE}/api/internal/submissions/${owner_id}/approve${INTERNAL_QUERY}" "{}")
owner_approve_status=$(get_status "${owner_approve}")
owner_approve_body=$(get_body "${owner_approve}")
if [[ "${owner_approve_status}" != "200" ]]; then
  echo "Owner approve failed: ${owner_approve_body}" >&2
  exit 1
fi

# Owner promote
owner_promote=$(request POST "${BASE}/api/internal/submissions/${owner_id}/promote${INTERNAL_QUERY}" "{}")
owner_promote_status=$(get_status "${owner_promote}")
owner_promote_body=$(get_body "${owner_promote}")
if [[ "${owner_promote_status}" != "200" ]]; then
  echo "Owner promote failed: ${owner_promote_body}" >&2
  exit 1
fi
owner_place_id=$(extract_field "${owner_promote_body}" "placeId")
require_non_empty "${owner_place_id}" "owner placeId"

# Owner places list
owner_place_id_encoded=$(urlencode_basic "${owner_place_id}")
owner_name_encoded=$(urlencode_basic "${OWNER_NAME}")
places_url="${BASE}/api/places?q=${owner_name_encoded}&limit=5"
if [[ -n "${PLACES_QUERY}" ]]; then
  places_url="${BASE}/api/places?${PLACES_QUERY}&placeId=${owner_place_id_encoded}&q=${owner_name_encoded}&limit=5"
fi
owner_places=$(request GET "${places_url}")
owner_places_status=$(get_status "${owner_places}")
owner_places_body=$(get_body "${owner_places}")
if [[ "${owner_places_status}" != "200" ]]; then
  echo "Owner places list failed: ${owner_places_body}" >&2
  exit 1
fi
if ! echo "${owner_places_body}" | grep -q "${owner_place_id}"; then
  echo "Owner placeId not found in places list" >&2
  exit 1
fi

# Owner place detail
owner_place_detail=$(request GET "${BASE}/api/places/by-id?id=${owner_place_id_encoded}${PLACE_DETAIL_QUERY}")
owner_place_detail_status=$(get_status "${owner_place_detail}")
owner_place_detail_body=$(get_body "${owner_place_detail}")
if [[ "${owner_place_detail_status}" != "200" ]]; then
  echo "Owner place detail failed: ${owner_place_detail_body}" >&2
  exit 1
fi

# Community submission
community_response=$(request POST "${BASE}/api/submissions/community${SUBMIT_QUERY}" "$(submit_community_payload)")
community_status=$(get_status "${community_response}")
community_body=$(get_body "${community_response}")
if [[ "${community_status}" != "201" && "${community_status}" != "200" ]]; then
  echo "Community submit failed: ${community_body}" >&2
  exit 1
fi
community_id=$(extract_field "${community_body}" "id")
community_kind=$(extract_field "${community_body}" "kind")
require_non_empty "${community_id}" "community id"
require_non_empty "${community_kind}" "community kind"

# Community approve
community_approve=$(request POST "${BASE}/api/internal/submissions/${community_id}/approve${INTERNAL_QUERY}" "{}")
community_approve_status=$(get_status "${community_approve}")
community_approve_body=$(get_body "${community_approve}")
if [[ "${community_approve_status}" != "200" ]]; then
  echo "Community approve failed: ${community_approve_body}" >&2
  exit 1
fi

# Community promote
community_promote=$(request POST "${BASE}/api/internal/submissions/${community_id}/promote${INTERNAL_QUERY}" "{}")
community_promote_status=$(get_status "${community_promote}")
community_promote_body=$(get_body "${community_promote}")
if [[ "${community_promote_status}" != "200" ]]; then
  echo "Community promote failed: ${community_promote_body}" >&2
  exit 1
fi
community_place_id=$(extract_field "${community_promote_body}" "placeId")
require_non_empty "${community_place_id}" "community placeId"

# Community places list
community_place_id_encoded=$(urlencode_basic "${community_place_id}")
community_name_encoded=$(urlencode_basic "${COMMUNITY_NAME}")
community_places_url="${BASE}/api/places?q=${community_name_encoded}&limit=5"
if [[ -n "${PLACES_QUERY}" ]]; then
  community_places_url="${BASE}/api/places?${PLACES_QUERY}&placeId=${community_place_id_encoded}&q=${community_name_encoded}&limit=5"
fi
community_places=$(request GET "${community_places_url}")
community_places_status=$(get_status "${community_places}")
community_places_body=$(get_body "${community_places}")
if [[ "${community_places_status}" != "200" ]]; then
  echo "Community places list failed: ${community_places_body}" >&2
  exit 1
fi
if ! echo "${community_places_body}" | grep -q "${community_place_id}"; then
  echo "Community placeId not found in places list" >&2
  exit 1
fi

# Community place detail
community_place_detail=$(request GET "${BASE}/api/places/by-id?id=${community_place_id_encoded}${PLACE_DETAIL_QUERY}")
community_place_detail_status=$(get_status "${community_place_detail}")
community_place_detail_body=$(get_body "${community_place_detail}")
if [[ "${community_place_detail_status}" != "200" ]]; then
  echo "Community place detail failed: ${community_place_detail_body}" >&2
  exit 1
fi

# Report submission
report_response=$(request POST "${BASE}/api/submissions/report${SUBMIT_QUERY}" "$(submit_report_payload)")
report_status=$(get_status "${report_response}")
report_body=$(get_body "${report_response}")
if [[ "${report_status}" != "201" && "${report_status}" != "200" ]]; then
  echo "Report submit failed: ${report_body}" >&2
  exit 1
fi
report_id=$(extract_field "${report_body}" "id")
report_kind=$(extract_field "${report_body}" "kind")
require_non_empty "${report_id}" "report id"
require_non_empty "${report_kind}" "report kind"

# Report approve
report_approve=$(request POST "${BASE}/api/internal/submissions/${report_id}/approve${INTERNAL_QUERY}" "{}")
report_approve_status=$(get_status "${report_approve}")
report_approve_body=$(get_body "${report_approve}")
if [[ "${report_approve_status}" != "200" ]]; then
  echo "Report approve failed: ${report_approve_body}" >&2
  exit 1
fi

# Report detail (confirm saved state)
report_detail=$(request GET "${BASE}/api/internal/submissions/${report_id}${INTERNAL_QUERY}")
report_detail_status=$(get_status "${report_detail}")
report_detail_body=$(get_body "${report_detail}")
if [[ "${report_detail_status}" != "200" ]]; then
  echo "Report detail failed: ${report_detail_body}" >&2
  exit 1
fi
if ! echo "${report_detail_body}" | grep -q '"status"'; then
  echo "Report detail missing status" >&2
  exit 1
fi

echo "Smoke test complete."
