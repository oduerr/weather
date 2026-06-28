# AGENTS.md — A Readme.md for Coding Agents

This file captures project knowledge and guardrails so agents can make safe, high‑impact edits quickly. 

---

## Quick facts

- **Type**: Static single‑page web app (no build, opens via file:// or any static host).
- **Stack**: Vanilla HTML/CSS/JS with Plotly.js; global objects instead of ES modules.
- **Entry**: `index.html` loads scripts in order; no bundler.
- **Key globals**: `window.WeatherAPI`, `window.WeatherPlot`, `window.ComparePanel`, `window.OverviewPanel`, `window.VisRegistry`, `window.LocationPicker`, `window.LocationSearch`, `window.SwipeNavigation`, `window._savedXRange`, `window.applyActiveView`.
- **Primary DOM**: `#controls` (fixed top control bar), `#fade-button` (manual toggle), `#plot` (content area).
- **URL contracts**: Full app state encoded in query params (`lat`, `lon`, `name`, `model`, `panel`, `view`).

---

## Architecture overview

- `index.html`
  - Styles for mobile‑friendly controls and a fullscreen plot area.
  - Persistent, fixed `#fade-button` at top‑right to manually toggle `#controls` visibility.
  
- `js/api.js` → Data layer
  - Caching via `localStorage` (1h). Live fetch with fixture fallback.
  - Forecast: Open‑Meteo (deterministic vs ensemble endpoints/variables).
  - Observations: Konstanz station + BrightSky (Konstanz only).
  
- `js/plot.js` → Visualization
  
- `js/visRegistry.js` → Panel router
  - Implements numbers‑only `actuals` panel (Observed Station, Observed BrightSky, Forecast Model). No Plotly in this view.

- `js/main.js` → Orchestration & URL state
  - Dropdown population (`#locationSelect`, `#modelSelect`, `#panelSelect`).
  - View buttons (`1d`, `2d`, `5d`, `all`) update both plot and URL (`view` param).
  - Manual controls toggle wired to `#fade-button` only.

- `js/locationPicker.js` → Map picker modal (Leaflet loaded on‑demand)
  - Adds options to location dropdown: separator, `SEARCH_LOCATION`, `CURRENT_LOCATION`, `MAP_PICKER`.
  
- `js/locationSearch.js` → Location search modal + geolocation
  - Uses Open‑Meteo Geocoding API. Keyboard navigation and selection.
  - Navigates via the canonical URL updater and triggers `fetchAndPlot`.

- `js/comparePanel.js` → Compare panel (multi-model overlay)
  - Fetches multiple models in parallel; state persists across re-renders.
  - Symbol size restyles dynamically via `Plotly.restyle` when view range changes.

- `js/hourlyPanel.js` → Hourly tiles panel
  - No Plotly (like `actuals`); pure DOM under `#plot`.
  - Vertical day groups, each a horizontal `scroll-snap` row of tiles.
  - Tiles default to every `STEP_H` (3) hours; tapping a tile toggles `expanded` (a module Set keyed by `date-blockIndex`) and re-renders in place, drilling that block into its individual hours. `lastRender` holds the last args for the in-place re-render; scroll positions are preserved.
  - Per tile: weather symbol, temp (blue→red colour scale), UV, wind (speed + direction arrow), precip prob + amount bar. Day/night tint via hourly `is_day` (fallback: sunrise/sunset). Sunrise/sunset marker tiles inserted by time.
  - Starts at the current Berlin hour; first tile marked "Now". Reuses `WeatherIcons` + plot.js wind-arrow convention. `is_day` is requested in `api.js` hourly vars.

- `js/overviewPanel.js` → Calendar overview panel
  - Async render; fetches BrightSky past days for current week in parallel.
  - 7-column Mon–Sun grid; `min-width: 980px` container + `#plot overflow-x: auto`.

- `js/swipeNavigation.js` → Swipe/keyboard panning
  - Horizontal swipe left → later time (map-drag convention). Vertical swipe is intentionally ignored (it collided with scrolling); panel switching is via the dropdown or ↑/↓ keys (in main.js).
  - Arrow left/right keys pan; always active (no controls-hidden gate).
  - Every range change saves to `window._savedXRange`; `window.applyActiveView()` restores after render.

---

## State management via URL

- Query params define the entire app state:
  - `lat`, `lon`, `name` (location)
  - `model` (one of `models[].id` in `main.js`)
  - `panel` (`compare`, `temperature`, `uv_wind`, `overview`, `actuals`, `hourly`) — default `compare`
  - `view` (`1d`, `2d`, `5d`, `all`)
- Always use `updateUrlWithAppState()` when programmatically changing selections to keep history, back/forward, and deep links consistent.
- `popstate` handler restores selections and triggers a re‑render; `restoreViewFromUrl(view)` handles `view` after render.

---

## Plot patterns and guardrails

- Always set the active plot attributes `data-start-time` and `data-end-time` after computing the domain; view buttons, swipe, and navigation depend on them. (The active plot element is `#compare-chart` in compare panel mode, and `#plot` in other modes).
- Use `window.applyActiveView()` inside every panel's `Plotly.newPlot().then()` to restore the saved range. `window._savedXRange` is set by all range-changing functions (view buttons, pan, swipe).
- On mobile, Plotly toolbar is hidden; layout sizes depend on window size. Relayout on `resize` and orientation changes is already wired.
- The `actuals` panel must not create a Plotly plot. It renders a simple table under `#plot`.

---

## Panels and extension points

- Add a new panel by registering a function in `window.VisRegistry` and exposing it in the `#panelSelect` options in `index.html`. Also add to `PANELS` array and `PANEL_CONFIG` in `main.js`, and to the `validPanels` list.
- Panel renderer signature: `(data, location, model, config)` — may be `async`.
- The Overview Table panel (`overviewTable.js`) has been removed; replaced by the calendar Overview panel.
- Use existing render helpers in `WeatherPlot`; ensure to set domain attributes and to integrate with `ViewportPreserver` if you instantiate Plotly.
- Respect the `panel` query param and ensure `updateUrlWithAppState()` is called when panel changes.

---

## Models and ensemble handling

- Model list is defined in `main.js` (`models` array). Each item has `{ id, label, model, type }` where `type` is `deterministic` or `ensemble`.

---

## Observations integration

- Observations are currently Konstanz‑specific:
  - Konstanz University weather station (hourly aggregation; NaN if unavailable).
  - BrightSky historical data for the current day; `lastObsTime` computed and provided in `observations`.
- Visual renderers use a “last obs” vertical line and annotation when available.
- The `actuals` panel computes latest‑within‑6‑hours values per source and nearest‑hour forecast values for comparison.

---

## Caching and fixture fallback

- Forecast cache key: `${lat},${lon},${model.id}`; TTL 1 hour.

---

## UX conventions to preserve

- Mobile‑first controls; touch targets ≥44px.

---

## Do / Don’t for agents

- Do
  - Use existing globals and patterns; avoid ES module imports to keep file:// compatibility.
  - Update URL via `updateUrlWithAppState()` on any state change; preserve history.
  - Capture/apply viewport when replotting to preserve user zoom/pan.
  - Set `data-start-time`/`data-end-time` on the active plot container (`#plot` or `#compare-chart`) when Plotly is active.
  - Keep `#fade-button` semantics manual‑only; ensure its z‑index stays above `#controls`.
  - Keep changes minimal; prefer adding new modules/functions over invasive edits.

- Don’t
  - Don’t introduce build steps, bundlers, or module syntax that breaks file://.
  - Don’t rely on timers or non‑deterministic auto‑fade logic for controls.
  - Don’t create Plotly charts inside the `actuals` panel.

## Project memories to preserve

- Controls toggle must remain manual via `#fade-button` (fixed top‑right, z‑index > `#controls`).
- `actuals` panel is a numbers‑only view comparing Observed (Station/BrightSky) versus Forecast, with per‑source timestamps and model label; no Plotly instance should be created for this panel.
- The app must remain usable via file:// without a build step; use globals, not ES module syntax.


## Finishing up
- When you make changes that require different architectures and go beyond this document, ask the user and then also update this document (AGENTS.md) accordingly.
- You don't need to start a server to test your changes the user will take care of it

