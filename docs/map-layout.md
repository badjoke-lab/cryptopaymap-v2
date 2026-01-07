# Map layout: 0px height prevention rules

## Why this matters
Map rendering can silently break when its container computes to `0px` height. When that happens, Leaflet still initializes but the map appears blank or collapsed. This has caused production regressions in the past, so the layout rules below are treated as **non-negotiable** to prevent a repeat.

## Non-negotiable rules

### 1) Always guarantee a minimum height
Ensure the map container (and any wrapper that controls its size) has an explicit height or **minimum height**. Without this, the computed height can fall back to `0px` when parent constraints change.

### 2) Parent layout must allow vertical growth
If a parent uses Flexbox, it must allow the map section to grow to fill available space. Use `flex: 1` (or `flex-grow: 1`) on the map wrapper and ensure the parent itself has a defined height. A flex child with no growth in a heightless parent will collapse to `0px`.

### 3) Keep Leaflet container height explicit
The `.leaflet-container` element must inherit a stable height. Ensure the CSS chain from the page down to the Leaflet container defines a height or min-height so the map surface remains measurable.

## Quick checklist
- [ ] The map wrapper has `min-height` (or fixed height in specific layouts).
- [ ] Any flex parent sets a height and the map wrapper uses `flex: 1`.
- [ ] `.leaflet-container` ends up with a non-zero computed height.

