# Development Notes

## Architecture

Static single-page app — vanilla HTML/CSS/JS, no build step, no bundler. Global objects instead of ES modules to maintain `file://` compatibility.

### File structure

```
weather/
├── index.html              # Entry point: styles, controls HTML, script tags
├── radar.html              # Standalone animated rain radar (Leaflet + RainViewer)
├── js/
│   ├── api.js              # Data layer: Open-Meteo, BrightSky, fogcast station
│   ├── plot.js             # Temperature and UV/Wind Plotly panels
│   ├── comparePanel.js     # Compare panel (multi-model overlay)
│   ├── overviewPanel.js    # Calendar overview panel
│   ├── visRegistry.js      # Panel router + actuals panel
│   ├── main.js             # Orchestration, URL state, event handlers
│   ├── locationPicker.js   # Map picker modal (Leaflet loaded on-demand)
│   ├── locationSearch.js   # Geocoding search modal
│   ├── swipeNavigation.js  # Touch swipe + keyboard pan
│   └── weatherIcons.js     # WMO code → emoji mapping
└── AGENTS.md               # Architecture notes for AI coding assistants
```

### Key globals

| Global | Module | Purpose |
|---|---|---|
| `window.WeatherAPI` | `api.js` | Fetch, cache, process all data |
| `window.WeatherPlot` | `plot.js` | Temperature + UV/Wind panels |
| `window.ComparePanel` | `comparePanel.js` | Multi-model compare panel |
| `window.OverviewPanel` | `overviewPanel.js` | Calendar overview panel |
| `window.VisRegistry` | `visRegistry.js` | Panel routing |
| `window.SwipeNavigation` | `swipeNavigation.js` | Swipe + keyboard nav |
| `window._savedXRange` | `main.js` | Persists exact x-axis range across panel switches |
| `window.applyActiveView` | `main.js` | Applies saved range after any panel renders |

---

## Data flow

```
User action
    → fetchAndPlot() [main.js]
        → WeatherAPI.getWeatherDataWithFallback(location, model)
            → getForecastData()       [Open-Meteo, cached 1h]
            → getObservationData()    [BrightSky + fogcast, Konstanz only]
        → VisRegistry.renderPanel(panel, data, location, model, config)
            → panel-specific render function
                → applyActiveView()   [restores saved x-axis range]
```

---

## Panels

### Compare (`comparePanel.js`)
Default panel. Fetches multiple models in parallel. State (`selectedModelIds`, `selectedParams`, `showAllModels`, `showAllParams`) persists across re-renders. Symbol size adjusts dynamically with view range (1d→26px, 2d→20px, 5d→13px, all→9px).

### Temperature / UV & Wind (`plot.js`)
Plotly multi-subplot charts. Compact layout applied automatically when `window.innerWidth < 768` (removes axis titles, tightens margins). Dew point toggle in controls bar (temperature panel only). Wind direction shown as Unicode arrows (↑↗→↘↓↙←↖) on the wind speed trace.

### Overview (`overviewPanel.js`)
Async render — fetches BrightSky historical data for past days of the current week in parallel with the forecast render. Calendar grid uses `repeat(7, minmax(0, 1fr))` columns; container has `min-width: 980px` so `#plot` handles horizontal scroll on mobile.

### Actuals (`visRegistry.js`)
Pure DOM, no Plotly. Renders a comparison table: Observed (fogcast station) | Observed (BrightSky) | Forecast.

---

## View range persistence

`window._savedXRange = { start, end }` is set by every function that changes the x-axis range:
- `WeatherPlot.adjustViewRange` / `viewOneDay`
- `ComparePanel.relayoutView` / `viewAll` / `animateRange`
- `SwipeNavigation.panTime`

After each panel renders, `window.applyActiveView()` clamps the saved range to the new panel's data boundaries and calls `Plotly.relayout`.

---

## Observations (Konstanz only)

| Source | Fields used | Notes |
|---|---|---|
| fogcast station | `temperature`, `water_temperature` | Hourly averages; fetched from 2h before UTC midnight to cover Berlin midnight |
| BrightSky (DWD) | `temperature`, `wind_speed/gust/direction`, `humidity`, `precipitation_10`, `pressure_msl`, `icon` | Times converted to Europe/Berlin; `tz=Europe/Berlin` passed to API |

BrightSky also used in the Overview panel to fill past week days with observed tiles.

---

## Error handling

Open-Meteo failures show a red dismissible banner. Observations (BrightSky, fogcast) are fetched independently and fail silently — the forecast still renders.

---

## Caching

Forecast cache key: `${lat},${lon},${model.id}` — 1 hour TTL in `localStorage`. Model metadata cached separately per model with 1 hour TTL.

---

## Mobile layout

- Controls bar: 2 rows (row 1: location + radar + view buttons + panel; row 2: model, hidden for Compare)
- `compact = window.innerWidth < 768`: removes axis titles, shortens tick format, tightens margins
- `dragmode: false` in all Plotly layouts — prevents accidental zoom on touch
- Swipe left/right pans time; swipe up/down cycles panels (always active)

---

## Keyboard shortcuts

`1/2/5/a` view range · `t/u/c/o` panels · `r` radar · `←/→` pan · `↑/↓` panels · `Esc` toggle controls · `?` help overlay
