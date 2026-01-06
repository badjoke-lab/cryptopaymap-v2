# Map layout rule (Leaflet height must not be 0)

## Why this exists
Leaflet maps require a non-zero container height.  
If the container becomes `height: 0` (or collapses), tiles/pins/clusters won't render and the map becomes unusable.

## Rule (do not remove)
The map container must have an explicit height/min-height.

- Keep `components/map/map.css` height/min-height rules.
- Do not “clean up” these rules even if they look redundant.
- If layout is refactored, re-verify `/map` renders tiles + pins (and run `npm run test:map-smoke`).

## Quick check
- Open `/map`
- Confirm: tiles render + at least one pin/cluster appears
- Run: `npm run test:map-smoke`
