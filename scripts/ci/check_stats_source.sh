#!/usr/bin/env bash
set -euo pipefail

ROUTE_FILE="app/api/stats/route.ts"
REQUIRED_POPULATION_ID='"places:map_visible:v1"'

if [[ ! -f "$ROUTE_FILE" ]]; then
  echo "ERROR: Missing $ROUTE_FILE"
  exit 1
fi

if rg -n "stats_cache" "$ROUTE_FILE" >/dev/null; then
  echo "ERROR: Forbidden source split detected. Remove stats_cache references from $ROUTE_FILE"
  rg -n "stats_cache" "$ROUTE_FILE"
  exit 1
fi

mapfile -t population_lines < <(rg -n 'population_id\s*:' "$ROUTE_FILE")

if [[ ${#population_lines[@]} -eq 0 ]]; then
  echo "ERROR: population_id field is missing in $ROUTE_FILE"
  exit 1
fi

invalid_lines=()
for line in "${population_lines[@]}"; do
  if [[ "$line" != *"population_id"*"$REQUIRED_POPULATION_ID"* ]]; then
    invalid_lines+=("$line")
  fi
done

if [[ ${#invalid_lines[@]} -gt 0 ]]; then
  echo "ERROR: population_id must be fixed to $REQUIRED_POPULATION_ID"
  printf '%s\n' "${invalid_lines[@]}"
  exit 1
fi

echo "OK: Stats source guard passed."
