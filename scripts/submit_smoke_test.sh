#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASS="${ADMIN_PASS:-}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/cpm_internal_cookie_$$.txt}"

if [[ -z "$ADMIN_USER" || -z "$ADMIN_PASS" ]]; then
  echo "Missing ADMIN_USER/ADMIN_PASS for internal auth." >&2
  exit 1
fi

trap 'rm -f "$COOKIE_JAR"' EXIT

internal_auth_args=(-u "${ADMIN_USER}:${ADMIN_PASS}" -c "$COOKIE_JAR" -b "$COOKIE_JAR")

request() {
  local method="$1"
  local url="$2"
  shift 2
  local response
  response=$(curl -sS -w "\n%{http_code}" -X "$method" "$url" "$@")
  local status="${response##*$'\n'}"
  local body="${response%$'\n'*}"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "Request failed: $method $url ($status)" >&2
    echo "$body" >&2
    exit 1
  fi
  printf "%s" "$body"
}

json_value() {
  local body="$1"
  local key="$2"
  echo "$body" | sed -n "s/.*\"$key\":\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

RUN_ID="$(date +%s)"

OWNER_NAME="smoke-owner-${RUN_ID}"
COMMUNITY_NAME="smoke-community-${RUN_ID}"
REPORT_NAME="smoke-report-${RUN_ID}"

OWNER_PAYLOAD=$(cat <<EOF
{"verificationRequest":"owner","name":"$OWNER_NAME","country":"JP","city":"Tokyo","address":"1-2-3","category":"cafe","contactEmail":"owner-$RUN_ID@example.com","ownerVerification":"domain","paymentUrl":"https://example.com/pay","acceptedChains":["BTC"],"lat":35.6895,"lng":139.6917,"termsAccepted":true}
EOF
)

COMMUNITY_PAYLOAD=$(cat <<EOF
{"verificationRequest":"community","name":"$COMMUNITY_NAME","country":"JP","city":"Osaka","address":"4-5-6","category":"restaurant","contactEmail":"community-$RUN_ID@example.com","acceptedChains":["BTC"],"communityEvidenceUrls":["https://example.com/evidence"],"lat":34.6937,"lng":135.5023}
EOF
)

REPORT_PAYLOAD=$(cat <<EOF
{"verificationRequest":"report","placeName":"$REPORT_NAME","reportReason":"Smoke test report","reportAction":"hide","contactEmail":"report-$RUN_ID@example.com"}
EOF
)

echo "Running submit smoke test against $BASE_URL"

owner_create=$(request POST "$BASE_URL/api/submissions" -F "payload=${OWNER_PAYLOAD};type=application/json")
owner_id=$(json_value "$owner_create" "submissionId")
owner_suggested=$(json_value "$owner_create" "suggestedPlaceId")
if [[ -z "$owner_id" || -z "$owner_suggested" ]]; then
  echo "Failed to extract owner submissionId/suggestedPlaceId" >&2
  echo "$owner_create" >&2
  exit 1
fi
request POST "$BASE_URL/api/internal/submissions/$owner_id/approve" "${internal_auth_args[@]}" >/dev/null
owner_promote=$(request POST "$BASE_URL/api/internal/submissions/$owner_id/promote" "${internal_auth_args[@]}")
owner_place_id=$(json_value "$owner_promote" "placeId")
if [[ -z "$owner_place_id" ]]; then
  echo "Failed to extract owner placeId" >&2
  echo "$owner_promote" >&2
  exit 1
fi
owner_list=$(request GET "$BASE_URL/api/places" --get --data-urlencode "q=$OWNER_NAME")
echo "$owner_list" | grep -q "$OWNER_NAME"
request GET "$BASE_URL/api/places/by-id" --get --data-urlencode "id=$owner_place_id" >/dev/null
echo "owner flow: ok"

community_create=$(request POST "$BASE_URL/api/submissions" -F "payload=${COMMUNITY_PAYLOAD};type=application/json")
community_id=$(json_value "$community_create" "submissionId")
community_suggested=$(json_value "$community_create" "suggestedPlaceId")
if [[ -z "$community_id" || -z "$community_suggested" ]]; then
  echo "Failed to extract community submissionId/suggestedPlaceId" >&2
  echo "$community_create" >&2
  exit 1
fi
request POST "$BASE_URL/api/internal/submissions/$community_id/approve" "${internal_auth_args[@]}" >/dev/null
community_promote=$(request POST "$BASE_URL/api/internal/submissions/$community_id/promote" "${internal_auth_args[@]}")
community_place_id=$(json_value "$community_promote" "placeId")
if [[ -z "$community_place_id" ]]; then
  echo "Failed to extract community placeId" >&2
  echo "$community_promote" >&2
  exit 1
fi
community_list=$(request GET "$BASE_URL/api/places" --get --data-urlencode "q=$COMMUNITY_NAME")
echo "$community_list" | grep -q "$COMMUNITY_NAME"
request GET "$BASE_URL/api/places/by-id" --get --data-urlencode "id=$community_place_id" >/dev/null
echo "community flow: ok"

report_create=$(request POST "$BASE_URL/api/submissions" -F "payload=${REPORT_PAYLOAD};type=application/json")
report_id=$(json_value "$report_create" "submissionId")
if [[ -z "$report_id" ]]; then
  echo "Failed to extract report submissionId" >&2
  echo "$report_create" >&2
  exit 1
fi
request POST "$BASE_URL/api/internal/submissions/$report_id/approve" "${internal_auth_args[@]}" >/dev/null
report_detail=$(request GET "$BASE_URL/api/internal/submissions/$report_id" "${internal_auth_args[@]}")
echo "$report_detail" | grep -q "\"status\":\"approved\""
echo "report flow: ok"
