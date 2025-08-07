# Weather Data Fetcher

This Python script fetches real weather data from the Open-Meteo API and saves it as JSON files for development and testing.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Run the script to fetch multiple datasets:
```bash
python fetch_weather_data.py
```

This will create:
- `fixtures/konstanz_weather.json` - Konstanz weather data (deterministic)
- `fixtures/zurich_weather.json` - Zurich weather data (Swiss model)
- `fixtures/espoo_weather.json` - Espoo weather data (Finland)
- `fixtures/konstanz_ensemble.json` - Konstanz ensemble data

### Use functions individually:

```python
from fetch_weather_data import fetch_weather_data_to_json, fetch_ensemble_data_to_json

# Fetch deterministic weather data
fetch_weather_data_to_json(
    latitude=47.6952, 
    longitude=9.1307, 
    model="icon_d2",
    output_file="fixtures/my_weather.json"
)

# Fetch ensemble weather data
fetch_ensemble_data_to_json(
    latitude=47.6952, 
    longitude=9.1307, 
    model="icon_d2",
    output_file="fixtures/my_ensemble.json"
)
```

## Available Models

### Deterministic Models:
- `icon_d2` - German ICON D2 model
- `meteoswiss_icon_ch1` - Swiss ICON CH1 model
- `meteoswiss_icon_ch2` - Swiss ICON CH2 model
- `arpege_europe` - French ARPEGE Europe model
- `arome_france` - French AROME France model

### Ensemble Models:
- `icon_d2` - German ICON D2 ensemble
- `gfs025` - GFS ensemble
- `ecmwf_ifs025` - ECMWF ensemble

## Data Structure

The JSON files contain:
- **hourly**: Hourly weather data (temperature, humidity, precipitation, etc.)
- **daily**: Daily sunrise/sunset times
- **metadata**: Generation timestamp and source information

## Benefits

- **Real Data**: Get actual current weather data
- **No Rate Limits**: Develop without hitting API limits
- **Consistent Testing**: Use the same data across development sessions
- **Multiple Locations**: Test with different weather conditions
- **Multiple Models**: Test deterministic vs ensemble models

## Integration with Weather App

The JSON files can be used with the weather app's fixture system:

```javascript
// In js/api.js, you can load these files:
const data = await fetch('./fixtures/konstanz_weather.json');
```

This allows you to develop visualizers and test features without making API calls!
