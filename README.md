# ⛅ Weather App

A mobile-friendly weather forecast app with multiple models, interactive charts, a calendar overview, and observed data integration. Deployed as a static page — no server needed.

🔗 **Live**: https://oduerr.github.io/weather/

---

## Panels

| Panel | Description |
|---|---|
| 🔀 **Compare** *(default)* | Overlay multiple forecast models side by side with temperature, rain, wind, UV, symbols |
| 🕒 **Hourly** | Mobile-friendly swipeable hour tiles — weather symbol, temperature, UV, wind (speed + direction), precipitation probability & amount; grouped by day, "Now" highlighted |
| 🌡️ **Temperature** | Hourly temperature, precipitation, cloud cover, humidity, visibility with observed overlays |
| ☀️ **UV & Wind** | UV index and wind speed/gusts with Beaufort scale; wind direction shown as arrows on the wind trace |
| 📅 **Overview** | Calendar grid (Mon–Sun weeks); today highlighted; weekends tinted; past days filled with BrightSky observed data |
| 📍 **Actuals** | Side-by-side comparison of observed values (DWD station, BrightSky) vs current forecast |

---

## Features

- **Multi-model forecast**: Best Match, ICON D2/EU/Global, MeteoSwiss CH1/CH2, ECMWF, GFS, AROME and many more
- **Compare panel**: Toggle any combination of models and parameters (symbols, temperature, rain, wind, UV, humidity, dew point, clouds, visibility)
- **Calendar overview**: Weekly Mon–Sun grid with today highlighted; past days of the current week show BrightSky observed data with "Obs." badge (Konstanz only)
- **Rain Radar**: Opens an animated radar map (`radar.html`) centred on the selected location
- **Observed data** (Konstanz): DWD station via BrightSky (temperature, wind, humidity, precipitation, pressure) + HTWG fogcast station (air + lake water temperature)
- **Swipe navigation**: Swipe left/right to pan time axis; swipe up/down to cycle panels
- **Keyboard shortcuts**: `1` `2` `5` `a` for view range, `t` `u` `c` `o` for panels, `r` for Radar, `?` for help
- **Mobile-optimised**: Compact axis layout on screens <768px; touch-friendly controls
- **URL-driven state**: Full app state shareable as a URL

---

## URL Parameters

| Parameter | Values | Description |
|---|---|---|
| `lat` | float | Latitude |
| `lon` | float | Longitude |
| `name` | string | Location display name |
| `model` | model id | Weather model (see list in app) |
| `panel` | `compare` `temperature` `uv_wind` `overview` `actuals` | Active panel |
| `view` | `1d` `2d` `5d` `all` | Time range |

### Example links

```
# Konstanz — Compare panel
https://oduerr.github.io/weather/?lat=47.6952&lon=9.1307&name=Konstanz&panel=compare

# Zurich — Temperature, 2-day view, MeteoSwiss CH1
https://oduerr.github.io/weather/?lat=47.3769&lon=8.5417&name=Zurich&model=meteoswiss_icon_ch1&panel=temperature&view=2d

# Espoo — 5-day overview
https://oduerr.github.io/weather/?lat=60.2055&lon=24.6559&name=Espoo&panel=overview&view=5d
```

### Saved locations

| Location | Link |
|---|---|
| 🇩🇪 Konstanz | https://oduerr.github.io/weather/?lat=47.6952&lon=9.1307&name=Konstanz |
| 🇨🇭 Zurich | https://oduerr.github.io/weather/?lat=47.3769&lon=8.5417&name=Zurich&model=meteoswiss_icon_ch1 |
| 🇨🇭 ICON CH1 Chäserrugg | https://oduerr.github.io/weather/?lat=47.1549&lon=9.3128&name=Chäserrugg&model=meteoswiss_icon_ch1 |
| 🇨🇭 Wildhaus | https://oduerr.github.io/weather/?lat=47.2033&lon=9.3505&name=Wildhaus&model=meteoswiss_icon_ch1 |
| 🇫🇮 Espoo | https://oduerr.github.io/weather/?lat=60.2055&lon=24.6559&name=Espoo |
| 🌲 Fischbach | https://oduerr.github.io/weather/?lat=48.1577&lon=8.4876&name=Fischbach |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` `2` `5` `a` | View range: 1d / 2d / 5d / All |
| `t` | Temperature panel |
| `u` | UV & Wind panel |
| `c` | Compare panel |
| `o` | Overview panel |
| `r` | Open Radar in new tab |
| `←` `→` | Pan time axis |
| `↑` `↓` | Cycle panels |
| `Esc` | Show / hide controls |
| `?` | Keyboard shortcuts help |

---

## Data Sources

| Source | Data | Coverage |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Forecast (all models) | Worldwide |
| [BrightSky / DWD](https://brightsky.dev/) | Observed: temp, wind, precip, humidity, pressure | Konstanz |
| [HTWG fogcast station](https://fogcast.in.htwg-konstanz.de/) | Observed: air temp + Lake Constance water temp | Konstanz |
| [RainViewer](https://www.rainviewer.com/) | Animated radar tiles | Europe / World |

---

## Development

Static HTML/CSS/JS — no build step, no bundler. Open `index.html` directly or serve from any static host.

```bash
# Local development — just open the file
open index.html

# Or with any static server
python3 -m http.server 8080
```

See [`AGENTS.md`](AGENTS.md) for architecture notes intended for AI coding assistants.
