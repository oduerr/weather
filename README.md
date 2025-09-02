# Weather App

A simple weather weather application with interactive forecasts, multiple weather models, and location search functionality.

## Features

- 🌍 **Location Search**: Search for any location worldwide or use current location
- 🗺️ **Interactive Map**: Pick locations directly from an interactive map
- 🌤️ **Multiple Weather Models**: Choose from various weather prediction models (ICON, ECMWF, GFS, etc.)
- 📊 **Multiple Panels**: Temperature, UV & Wind, and Actuals (observed vs forecast)
- ⏰ **Flexible Time Views**: 1-day, 2-day, 5-day, or full forecast periods
- 🔗 **URL-Driven**: Complete app state can be shared via URL parameters
- 📱 **Mobile-Friendly**: Responsive design with touch-friendly controls

## URL Parameter System

The weather app supports comprehensive URL parameters, making it fully shareable and bookmarkable with any configuration:

### Location Parameters
- `lat` - Latitude coordinate (required with lon)
- `lon` - Longitude coordinate (required with lat)
- `name` - Location display name (optional)

### Weather Model Parameter
- `model` - Weather model ID (optional)
  - `bestmatch` - Best Match (default)
  - `icon_d2_det` - ICON D2 48h
  - `icon_seamless_det` - ICON Seamless
  - `meteoswiss_icon_ch1` - Swiss ICON CH1
  - `ecmwf_ensemble_1` - ECMWF Ensemble
  - `gfs025` - GFS Ensemble
  - And many more...

### Panel Parameter
- `panel` - Display panel (optional)
  - `temperature` - Temperature forecast (default)
  - `uv_wind` - UV Index & Wind
  - `actuals` - Observed vs Forecast

### View Parameter
- `view` - Time range view (optional)
  - `1d` - 1-day view
  - `2d` - 2-day view (default)
  - `5d` - 5-day view
  - `all` - Full forecast period

### Example URLs

**Basic location:**
```
https://oduerr.github.io/weather/?lat=52.5200&lon=13.4050&name=Berlin
```

**Complete configuration:**
```
https://oduerr.github.io/weather/?lat=47.3769&lon=8.5417&name=Zurich&model=icon_d2_det&panel=uv_wind&view=5d
```

**Weather model comparison:**
```
https://oduerr.github.io/weather/?lat=60.2055&lon=24.6559&name=Helsinki&model=ecmwf_ensemble_1&panel=temperature&view=2d
```

### Quick Location Links

* **Berlin**: https://oduerr.github.io/weather/?lat=52.5200&lon=13.4050&name=Berlin
* **Zurich**: https://oduerr.github.io/weather/?lat=47.3769&lon=8.5417&name=Zurich&model=meteoswiss_icon_ch1&panel=temperature
* **Helsinki**: https://oduerr.github.io/weather/?lat=60.2055&lon=24.6559&name=Helsinki&model=ecmwf_ensemble_1
* **Basel**: https://oduerr.github.io/weather/?lat=47.5596&lon=7.5886&name=Basel&panel=uv_wind
* **Kandersteg**: https://oduerr.github.io/weather/?lat=46.4967&lon=7.6747&name=Kandersteg&view=5d
* **Paderborn**: https://oduerr.github.io/weather/?lat=51.7167&lon=8.7667&name=Paderborn&model=icon_d2_det&panel=actuals

## Development

- To fetch weather data, run `python fetch_weather_data.py`
- Demo to access HTWG Konstanz weather station data `python tester_konstanz_weather.py`