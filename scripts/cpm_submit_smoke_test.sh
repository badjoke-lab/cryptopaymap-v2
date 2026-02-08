#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
INTERNAL_USER="${INTERNAL_USER:-admin}"
INTERNAL_PASS="${INTERNAL_PASS:-cryptoSO8map}"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

RESPONSE_BODY=""
RESPONSE_STATUS=""

request_json() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local extra_args="${4:-}"
  local response

  if [ -n "$data" ]; then
    response=$(curl -sS -w "\n%{http_code}" -H "Content-Type: application/json" -X "$method" $extra_args "$url" -d "$data")
  else
    response=$(curl -sS -w "\n%{http_code}" -X "$method" $extra_args "$url")
  fi

  RESPONSE_BODY="$(printf "%s" "$response" | sed '$d')"
  RESPONSE_STATUS="$(printf "%s" "$response" | tail -n 1)"
}

extract_json_value() {
  local body="$1"
  local key="$2"
  echo "$body" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

echo "==> Submit owner"
request_json "POST" "$BASE_URL/api/submissions/owner" '{
  "name": "Test Shop",
  "country": "JP",
  "city": "Tokyo",
  "address": "1-2-3 Test Street",
  "category": "cafe",
  "acceptedChains": ["BTC"],
  "contactEmail": "owner@example.com",
  "contactName": "Owner",
  "ownerVerification": "domain",
  "lat": 35.6895,
  "lng": 139.6917,
  "termsAccepted": true
}'
if [ "$RESPONSE_STATUS" != "201" ]; then
  echo "Owner submission failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
SUB_OWNER="$(extract_json_value "$RESPONSE_BODY" "id")"
if [ -z "$SUB_OWNER" ]; then
  echo "Failed to parse owner submission id: $RESPONSE_BODY"
  exit 1
fi

echo "==> Submit community"
request_json "POST" "$BASE_URL/api/submissions/community" '{
  "name": "Test Shop",
  "country": "JP",
  "city": "Tokyo",
  "address": "1-2-3 Test Street",
  "category": "cafe",
  "acceptedChains": ["BTC"],
  "contactEmail": "community@example.com",
  "contactName": "Community",
  "communityEvidenceUrls": ["https://example.com/evidence"],
  "lat": 35.6895,
  "lng": 139.6917,
  "termsAccepted": true
}'
if [ "$RESPONSE_STATUS" != "201" ]; then
  echo "Community submission failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
SUB_COMMUNITY="$(extract_json_value "$RESPONSE_BODY" "id")"
if [ -z "$SUB_COMMUNITY" ]; then
  echo "Failed to parse community submission id: $RESPONSE_BODY"
  exit 1
fi

echo "==> Submit report"
request_json "POST" "$BASE_URL/api/submissions" '{
  "verificationRequest": "report",
  "placeName": "Test Shop",
  "reportReason": "Test report",
  "reportAction": "hide",
  "contactEmail": "reporter@example.com"
}'
if [ "$RESPONSE_STATUS" != "201" ]; then
  echo "Report submission failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
SUB_REPORT="$(extract_json_value "$RESPONSE_BODY" "submissionId")"
if [ -z "$SUB_REPORT" ]; then
  SUB_REPORT="$(extract_json_value "$RESPONSE_BODY" "id")"
fi
if [ -z "$SUB_REPORT" ]; then
  echo "Failed to parse report submission id: $RESPONSE_BODY"
  exit 1
fi

echo "==> Acquire internal cookie"
request_json "GET" "$BASE_URL/api/internal/submissions?limit=1" "" "-u $INTERNAL_USER:$INTERNAL_PASS -c $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Internal auth failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi

echo "==> Approve submissions"
request_json "POST" "$BASE_URL/api/internal/submissions/$SUB_OWNER/approve" "" "-b $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Approve owner failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
request_json "POST" "$BASE_URL/api/internal/submissions/$SUB_COMMUNITY/approve" "" "-b $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Approve community failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
request_json "POST" "$BASE_URL/api/internal/submissions/$SUB_REPORT/approve" "" "-b $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Approve report failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi

echo "==> Promote owner"
request_json "POST" "$BASE_URL/api/internal/submissions/$SUB_OWNER/promote" "" "-b $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Promote owner failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
PLACE_OWNER_ID="$(extract_json_value "$RESPONSE_BODY" "placeId")"
if [ -z "$PLACE_OWNER_ID" ]; then
  echo "Failed to parse owner placeId: $RESPONSE_BODY"
  exit 1
fi

echo "==> Promote owner again (idempotent)"
request_json "POST" "$BASE_URL/api/internal/submissions/$SUB_OWNER/promote" "" "-b $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Promote owner again failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi

echo "==> Promote community"
request_json "POST" "$BASE_URL/api/internal/submissions/$SUB_COMMUNITY/promote" "" "-b $COOKIE_JAR"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Promote community failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi
PLACE_COMMUNITY_ID="$(extract_json_value "$RESPONSE_BODY" "placeId")"
if [ -z "$PLACE_COMMUNITY_ID" ]; then
  echo "Failed to parse community placeId: $RESPONSE_BODY"
  exit 1
fi

echo "==> Verify places list"
curl -sS "$BASE_URL/api/places?limit=800" | grep -q "Test Shop"

echo "==> Fetch place detail by ID"
PLACE_ID_ENCODED="$(printf '%s' "$PLACE_OWNER_ID" | sed 's/:/%3A/g')"
request_json "GET" "$BASE_URL/api/places/by-id?id=$PLACE_ID_ENCODED"
if [ "$RESPONSE_STATUS" != "200" ]; then
  echo "Place detail fetch failed: $RESPONSE_STATUS $RESPONSE_BODY"
  exit 1
fi

echo "Smoke test completed."
