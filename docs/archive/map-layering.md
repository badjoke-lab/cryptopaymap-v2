# Map Layering Rules (Click-Through Prevention)

This document defines the layering and interaction rules for the map UI to prevent the regression where pins are visible but not clickable.

## Key Layer Roles

| Layer | Typical element(s) | Responsibility | Notes |
| --- | --- | --- | --- |
| Leaflet panes | tile, overlay, marker panes | Core map rendering | Marker pane must stay above tile/overlay panes so pins remain visible and clickable. |
| Leaflet controls | zoom, attribution, custom controls | Map-level UI | Controls should remain on top of map panes but below app-level overlays. |
| Drawer | side drawer / nav | Global navigation | Should sit above controls and map panes to avoid map interaction conflicts. |
| Sheet / bottom panel | details sheet, filter panel | Contextual UI | Should overlay map when open; only its interactive regions should capture clicks. |
| Overlays | modals, toasts, banners | App-level alerts and flows | Must appear above all map and layout layers. |

## Pointer-Events Principles

1. **Map interaction is the default.** Non-interactive overlay wrappers should use `pointer-events: none` so panning/zooming and pin clicks reach the map.
2. **Only interactive regions opt in.** Buttons, list items, and form fields should explicitly set `pointer-events: auto` (or inherit) so they receive input.
3. **Avoid full-screen blockers.** A full-screen overlay with `pointer-events: auto` should only be used when intentionally blocking map interaction (e.g., modal).
4. **Sheet/Drawer boundaries matter.** Ensure only the visible sheet/drawer area captures clicks; the rest of the viewport should be transparent to events.

## z-index Principles

1. **Pins must stay above the map.** Leaflet marker pane should remain above tile and overlay panes to prevent invisible-but-unclickable pins.
2. **Controls above map panes, below app overlays.** Leaflet controls should not obscure app-level UI (drawer/sheet/overlay).
3. **App overlays are the top layer.** Modals, toasts, and banners should be the highest z-index when active.
4. **Avoid arbitrary z-index inflation.** Use a shared scale (documented in CSS/tokens if available) and only bump z-index when the layer’s role requires it.

## Quick Checklist

- [ ] Pins are clickable in all map states (drawer open, sheet open, overlays shown).
- [ ] Non-interactive wrappers use `pointer-events: none`.
- [ ] Interactive UI elements explicitly allow pointer events.
- [ ] z-index matches the layer’s role (map panes < controls < drawer/sheet < overlays).
