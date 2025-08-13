# Weather Application - Development Documentation

## 📋 Project Overview

**Weather** is a static web application for visualizing weather forecast data with ensemble support. The application fetches data from the Open-Meteo API and displays it using Plotly.js charts.

### 🎯 Key Features
- **Multi-location support** (Konstanz, Zurich, Espoo)
- **Multiple weather models** (ICON D2, MeteoSwiss, GFS)
- **Ensemble data visualization** with mean and mode calculations
- **Real-time weather data** from Konstanz University
- **File:// protocol compatibility** (no server required)
- **Modular JavaScript architecture**
- **Python data generation tools**

## 🏗️ Architecture

### File Structure
```
weather/
├── index.html                 # Main HTML file
├── js/
│   ├── api.js                # API module (data fetching, caching)
│   ├── plot.js               # Plotting module (charts, ensemble calculations)
│   ├── visRegistry.js        # Visualizer registry (panel system)
│   └── main.js               # Main orchestration module
├── fixtures/                 # Weather data fixtures for development
│   ├── konstanz_weather.json
│   ├── konstanz_ensemble.json
│   ├── zurich_weather.json
│   └── espoo_weather.json
├── fetch_weather_data.py     # Python script for generating fixtures
├── requirements.txt          # Python dependencies
├── README_weather_fetcher.md # Python script documentation
└── specs/
    └── refactor_requirememts.md # Original refactoring requirements
```

### Module Architecture

#### 1. **API Module** (`js/api.js`)
- **Global Object**: `window.WeatherAPI`
- **Functions**:
  - `fetchKonstanzWeather(callback)` - Real-time Konstanz data
  - `getWeatherData(location, model)` - Open-Meteo API calls with caching
  - `loadFixtureData(location, model)` - Fallback to fixture data
  - `getWeatherDataWithFallback(location, model)` - Main data access function

#### 2. **Plot Module** (`js/plot.js`)
- **Global Object**: `window.WeatherPlot`
- **Functions**:
  - `createContinuousEnsembleTraces(hourly, variable, yaxis, color)` - Ensemble mean traces
  - `calculateEnsembleMode(hourly, variable_name)` - **NEW**: Ensemble mode calculation
  - `renderWeatherData(data, location, model)` - Main plotting function
  - `adjustViewRange(days)` - Time range adjustment

#### 3. **Visualizer Registry** (`js/visRegistry.js`)
- **Global Object**: `window.VisRegistry`
- **Functions**:
  - `renderPanel(panelName, data, location, model, config)` - Panel rendering
  - `getAvailablePanels()` - List available panels
  - `hasPanel(panelName)` - Check panel availability

#### 4. **Main Module** (`js/main.js`)
- **Functions**:
  - `fetchAndPlot()` - Main orchestration function
  - `processWeatherData(data, selectedLoc, model)` - Data processing
  - Event handlers for UI interactions

## 🔧 Technical Implementation

### Data Flow
1. **User Selection** → Location and model selection
2. **API Call** → `window.WeatherAPI.getWeatherDataWithFallback()`
3. **Data Processing** → Fallback to fixtures if API unavailable
4. **Visualization** → `window.VisRegistry.renderPanel()` or direct plotting
5. **Chart Rendering** → Plotly.js with ensemble traces

### Caching Strategy
- **Local Storage**: 1-hour cache for API responses
- **Cache Key**: `${latitude},${longitude},${modelId}`
- **Fallback**: Fixture data for offline development

### Ensemble Data Processing
- **Mean Calculation**: Average across ensemble members
- **Mode Calculation**: **NEW** - Most frequent weather code
- **Support**: Temperature, humidity, precipitation, cloud cover, weather codes

## 🆕 Recent Features (Latest Refactoring)

### 1. **Ensemble Weather Code Mode Calculation**
```javascript
// New function in js/plot.js
window.WeatherPlot.calculateEnsembleMode = function(hourly, variable_name) {
  // Calculates most frequent weather code across ensemble members
  // Returns array of mode values for each time step
}
```

**Usage**:
```javascript
const weatherCodeMode = window.WeatherPlot.calculateEnsembleMode(hourly, "weather_code");
```

### 2. **Time Axis Bug Fix**
- **Problem**: Initial view showed empty days beyond data range
- **Solution**: Automatic range adjustment after plot creation
- **Implementation**: `Plotly.newPlot().then()` with `relayout()`

### 3. **Weather Code Support in Ensemble API**
- **Added**: `"weather_code"` to ensemble API calls
- **Updated**: Python script and API module
- **Result**: Ensemble weather code mode visualization

### 4. **Modular Architecture**
- **Separation**: Data fetching, plotting, and UI orchestration
- **Compatibility**: File:// protocol support (no server required)
- **Extensibility**: Visualizer registry for future panels

## 🐍 Python Development Tools

### Weather Data Fetcher (`fetch_weather_data.py`)
```python
# Generate deterministic weather data
fetch_weather_data_to_json(
    latitude=47.6952, 
    longitude=9.1307, 
    model="icon_d2",
    output_file="fixtures/konstanz_weather.json"
)

# Generate ensemble weather data
fetch_ensemble_data_to_json(
    latitude=47.6952, 
    longitude=9.1307, 
    model="icon_d2",
    output_file="fixtures/konstanz_ensemble.json"
)
```

**Features**:
- Multiple location support
- Deterministic and ensemble models
- Automatic fixture generation
- Metadata inclusion

## 🎨 UI Components

### Chart Layout
- **3-Row Grid**: Temperature/Humidity, Precipitation, Cloud Cover
- **Multiple Y-Axes**: Independent scaling for different variables
- **Weather Icons**: Emoji representation of weather codes
- **Night Shading**: Automatic day/night visualization
- **Ensemble Traces**: Mean and mode calculations

### Interactive Elements
- **Location Selector**: Dropdown with predefined locations
- **Model Selector**: Weather model selection
- **View Controls**: 2d, 5d, All buttons for time range
- **Real-time Updates**: Konstanz University temperature display

## 🔄 Development Workflow

### 1. **Local Development**
```bash
# No server required - open directly in browser
open index.html
```

### 2. **Data Generation**
```bash
# Install Python dependencies
pip install -r requirements.txt

# Generate new fixtures
python fetch_weather_data.py
```

### 3. **Code Structure**
- **Global Objects**: Avoid ES modules for file:// compatibility
- **Error Handling**: Graceful fallbacks to fixture data
- **Caching**: Local storage for API responses
- **Modularity**: Clear separation of concerns

## 🐛 Known Issues & Solutions

### 1. **Time Axis Range** ✅ FIXED
- **Issue**: Initial view showed empty days
- **Solution**: Automatic range adjustment after plot creation

### 2. **ES Module Compatibility** ✅ SOLVED
- **Issue**: ES modules don't work with file:// protocol
- **Solution**: Global objects (`window.WeatherAPI`, etc.)

### 3. **API Availability** ✅ HANDLED
- **Issue**: API might be unavailable
- **Solution**: Fallback to fixture data

## 📊 Data Sources

### Open-Meteo API
- **Base URL**: `https://api.open-meteo.com/v1/forecast`
- **Ensemble URL**: `https://ensemble-api.open-meteo.com/v1/ensemble`
- **Models**: ICON D2, MeteoSwiss, GFS
- **Variables**: Temperature, humidity, precipitation, weather codes, etc.

## 🚀 Deployment

### Static Hosting
- **No Server Required**: Works with file:// protocol
- **CDN Compatible**: Can be hosted on any static hosting service
- **CORS Free**: No cross-origin issues

### File Structure for Deployment
```
deployment/
├── index.html
├── js/
│   ├── api.js
│   ├── plot.js
│   ├── visRegistry.js
│   └── main.js
└── fixtures/ (optional - for offline mode)
```

## 🔮 Future Enhancements

### Planned Features
1. **Additional Panels**: Wind, pressure, UV index
2. **Custom Locations**: User-defined coordinates
3. **Data Export**: CSV/JSON download
4. **Mobile Optimization**: Responsive design improvements
5. **Advanced Ensembles**: Probability calculations

### Architecture Extensions
1. **Plugin System**: Third-party visualizers
2. **Configuration UI**: Dynamic panel management
3. **Data Sources**: Additional weather APIs
4. **Real-time Updates**: WebSocket integration

## 📝 Development Notes

### Code Style
- **ES6+**: Modern JavaScript features
- **JSDoc**: Function documentation
- **Error Handling**: Comprehensive try-catch blocks
- **Console Logging**: Development debugging

### Performance Considerations
- **Lazy Loading**: Data fetched on demand
- **Caching**: Local storage for API responses
- **Efficient Rendering**: Plotly.js optimization
- **Memory Management**: Proper cleanup of event listeners

### Testing Strategy
- **Manual Testing**: Browser-based testing
- **Fixture Data**: Consistent test data
- **Fallback Testing**: Offline mode verification
- **Cross-browser**: Chrome, Firefox, Safari compatibility


### Issue 1 Remove automatic panel removal
Issue: The controls panel automatically fades out after 3 seconds of inactivity, which can be disruptive to users who want to keep the controls visible.
Current Behavior:
Controls automatically hide after 3 seconds of no interaction
Multiple auto-hide triggers: mouse leave, scroll, window focus changes
Complex timing logic that can be confusing
Desired Behavior:
Controls visibility should ONLY change when the fade button is explicitly clicked
Remove all automatic hiding/showing logic
Keep the fade button always accessible (fixed position, top-right)
Simple toggle: visible ↔ hidden
Implementation Notes:
✅ Fade button moved to fixed position (top-right corner)
✅ Button styling updated for better accessibility
❌ Need to remove auto-hide logic from js/main.js
❌ Simplify fade controls to only respond to button clicks
❌ Remove event listeners for mouse leave, scroll, focus changes
Files to Modify:
js/main.js - Remove automatic fade logic, keep only button toggle
index.html - Fade button positioning and styling ✅ COMPLETED
Status: Partially implemented - UI changes complete, logic cleanup needed
The issue is now much clearer! You've completed the UI part (moving the fade button to a fixed position), but you still need to clean up the automatic fade logic in the JavaScript code to make it truly "manual only" as intended.


### Feature Request 1: One Day View Button
**Purpose**: Allow users to quickly switch to viewing a single day of weather data 
**Location**: Add button to the controls panel, next to existing time range controls. Name it "1d"
**Behavior**: When clicked, adjusts the plot to show data for the current day (00:00-23:59) and up to 4am the next day.
**User Benefit**: Quick access to detailed daily view without manually adjusting time ranges

### Issue 2 
Fade button is not working as expected, it not visible anymore.



### Feature Request 2: Numerical Actuals (Observed vs Forecast)
Purpose: Show key weather values as numbers (no graphs), comparing latest observed values from each source with the current forecast.
Location: Add a third panel option named actuals (label: “📍 Actuals”) in the panelSelect.
Scope (metrics):
Air temperature (°C)
Water temperature (°C, if available; typically station only)
Wind speed (km/h), wind gust (km/h), wind direction (°)
UV index
Precipitation (last hour, mm; if available) and/or precipitation probability next hour (%)
Cloud cover (%)
Data sources:
Observed A: Konstanz Weather Station (if selected location supports it)
Observed B: BrightSky (latest historical observation)
Forecast: Selected model’s current-hour forecast (Open‑Meteo)
Data selection rules:
Observed values: Use each source’s most recent sample within the last 6 hours. If none, show “N/A”.
Forecast values: Use the value for the current local hour (Europe/Berlin). If between steps, use the nearest step.
Show each observed source on its own row; do not merge sources.
Layout:
A compact grid/table:
Columns: Metric | Observed (Station) | Observed (BrightSky) | Forecast (Model)
Rows: One per metric listed in Scope.
Show units inline (e.g., “12.3 °C”).
Show per-row “as of” timestamps for observed sources (e.g., “last obs 13:20”); show model id/label for forecast.
If a metric is not provided by a source, display “N/A”.
Behavior:
No Plotly chart in this panel; render simple DOM elements in #plot.
Respect current selection (location + model).
Update whenever a new fetch completes (same cadence as other panels).

Accessibility/UX:
Mobile-friendly, readable font, clear column headings.
Use subtle color tags to distinguish Observed vs Forecast columns; avoid excessive styling.
Acceptance criteria:
Selecting “📍 Actuals” shows a numbers-only view with two observed rows (when available) and one forecast column.
Values populate correctly from each source or show “N/A” when missing.
Timestamps for observed data are visible and correct; model label is shown for forecast.
No Plotly toolbar appears; the panel does not instantiate a chart.
The previous FR2 was ambiguous; this version specifies a numbers-only “Actuals” panel, per-source observed rows, and a forecast column, with concrete data selection and layout.


### Feature Request 3: Preserve Zoom Level When Switching Models

Purpose:
Keep the current zoom/pan level in the Plotly charts when switching between different weather models, instead of resetting.

Current Behavior:
	•	When a user zooms or pans to a specific time range and then switches the weather model, the chart resets .
	•	This forces the user to manually re-zoom after each model change.

Desired Behavior:
	•	Store the current Plotly x-axis and y-axis ranges before switching models.
	•	After the new model data is loaded and plotted, reapply the stored ranges.
	•	If the stored range is partially outside the new data’s domain, clamp to the available range while keeping the zoom scale consistent.
  * Still keep the current behavior where the zoom is resetted when switching to different days via the buttons.
