// Visualizer Registry for FogCast weather app
// Maps panel names to their rendering functions

// Import the plotting functions
// Note: Since we're using global objects for file:// compatibility,
// we'll reference the global WeatherPlot object

/**
 * Registry mapping panel names to their rendering functions
 * Each function should accept: (data, location, model, config)
 */
window.VisRegistry = {
  /**
   * Temperature panel visualizer
   * Renders temperature charts with ensemble data
   */
  temperature: function(data, location, model, config = {}) {
    if (!window.WeatherPlot || !window.WeatherPlot.renderWeatherData) {
      console.error('WeatherPlot not available');
      return;
    }
    
    // Use the existing temperature rendering logic
    window.WeatherPlot.renderWeatherData(data, location, model);
    
    // Apply panel-specific configuration
    if (config.defaultView) {
      setTimeout(() => {
        window.WeatherPlot.adjustViewRange(parseInt(config.defaultView));
      }, 100);
    }
  },
  
  /**
   * UV Index and Wind panel visualizer
   * Renders UV index and wind charts with ensemble data
   */
  uv_wind: function(data, location, model, config = {}) {
    if (!window.WeatherPlot || !window.WeatherPlot.renderUVWindData) {
      console.error('WeatherPlot UV/Wind renderer not available');
      return;
    }
    
    // Use the UV/wind rendering logic
    window.WeatherPlot.renderUVWindData(data, location, model);
    
    // Apply panel-specific configuration
    if (config.defaultView) {
      setTimeout(() => {
        window.WeatherPlot.adjustViewRange(parseInt(config.defaultView));
      }, 100);
    }
  },

  /**
   * Actuals panel visualizer
   * Renders a numbers-only view comparing Observed (Station), Observed (BrightSky), and Forecast (Model)
   */
  actuals: function(data, location, model, config = {}) {
    const plot = document.getElementById('plot');
    if (!plot) return;

    // Clear any existing Plotly chart/DOM
    if (window.Plotly && plot.classList && plot.classList.contains('js-plotly-plot')) {
      try { Plotly.purge(plot); } catch (_) {}
    }
    plot.innerHTML = '';

    const observations = (data && data.observations) || {};
    const station = observations.weatherStation || null;
    const brightSky = observations.brightSky || null;
    const hourly = data && data.forecast && data.forecast.hourly ? data.forecast.hourly : null;

    // Helper: now in Europe/Berlin
    const nowBerlinStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
    const nowBerlin = new Date(nowBerlinStr);
    const sixHoursMs = 6 * 60 * 60 * 1000;

    function findLatestWithin(times, series) {
      if (!times || !series || !Array.isArray(times) || !Array.isArray(series) || times.length === 0) return { value: null, time: null };
      let bestIdx = -1;
      for (let i = times.length - 1; i >= 0; i--) {
        const t = new Date(times[i]);
        if (nowBerlin - t <= sixHoursMs && nowBerlin >= t) { bestIdx = i; break; }
      }
      if (bestIdx === -1) return { value: null, time: null };
      return { value: series[bestIdx], time: times[bestIdx] };
    }

    function findNearest(times, series) {
      if (!times || !series || !Array.isArray(times) || !Array.isArray(series) || times.length === 0) return { value: null, time: null };
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const t = new Date(times[i]);
        const diff = Math.abs(nowBerlin - t);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      return { value: series[bestIdx], time: times[bestIdx] };
    }

    function asOf(timeStr) {
      if (!timeStr) return '';
      try {
        const d = new Date(timeStr);
        return `as of ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } catch (_) { return ''; }
    }

    function fmt(value, unit, digits = 1) {
      if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
      if (typeof value !== 'number') return `${value}`;
      const v = Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits);
      return unit ? `${v} ${unit}` : `${v}`;
    }

    // Compute Station values (Konstanz only)
    const stTimes = station && station.times ? station.times : null;
    const stTemp = station ? findLatestWithin(stTimes, station.temperature) : { value: null, time: null };
    const stWater = station ? findLatestWithin(stTimes, station.waterTemperature) : { value: null, time: null };

    // Compute BrightSky observed values
    const bsTimes = brightSky && brightSky.times ? brightSky.times : null;
    const bsTemp = brightSky ? findLatestWithin(bsTimes, brightSky.temperature) : { value: null, time: null };
    const bsWind = brightSky ? findLatestWithin(bsTimes, brightSky.windSpeed) : { value: null, time: null };
    const bsGust = brightSky ? findLatestWithin(bsTimes, brightSky.windGustSpeed) : { value: null, time: null };
    const bsDir = brightSky ? findLatestWithin(bsTimes, brightSky.windDirection) : { value: null, time: null };
    const bsPrec = brightSky ? findLatestWithin(bsTimes, brightSky.precipitation) : { value: null, time: null };
    // Cloud cover and UV not available from BrightSky processed data

    // Compute Forecast values (nearest hour)
    const fcTimes = hourly && hourly.time ? hourly.time : null;
    const fcTemp = hourly ? findNearest(fcTimes, hourly.temperature_2m || []) : { value: null, time: null };
    const fcWind = hourly ? findNearest(fcTimes, hourly.wind_speed_10m || []) : { value: null, time: null };
    const fcGust = hourly ? findNearest(fcTimes, hourly.wind_gusts_10m || []) : { value: null, time: null };
    const fcDir = hourly ? findNearest(fcTimes, hourly.wind_direction_10m || []) : { value: null, time: null };
    const fcUV  = hourly ? findNearest(fcTimes, hourly.uv_index || []) : { value: null, time: null };
    const fcPrecProb = hourly ? findNearest(fcTimes, hourly.precipitation_probability || []) : { value: null, time: null };
    const fcCloud = hourly ? findNearest(fcTimes, hourly.cloud_cover || []) : { value: null, time: null };

    // Build table
    const container = document.createElement('div');
    container.style.padding = '12px';
    container.style.fontSize = '14px';
    container.style.lineHeight = '1.4';
    container.style.maxWidth = '900px';
    container.style.margin = '0 auto';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    function th(text) {
      const el = document.createElement('th');
      el.textContent = text;
      el.style.textAlign = 'left';
      el.style.padding = '8px';
      el.style.borderBottom = '1px solid #ddd';
      return el;
    }

    function td(value, subText = '') {
      const el = document.createElement('td');
      el.style.padding = '8px';
      el.style.borderBottom = '1px solid #f0f0f0';
      const main = document.createElement('div');
      main.textContent = value;
      main.style.fontWeight = '500';
      const sub = document.createElement('div');
      sub.textContent = subText;
      sub.style.fontSize = '12px';
      sub.style.color = '#666';
      if (subText) el.appendChild(main), el.appendChild(sub); else el.appendChild(main);
      return el;
    }

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(th('Metric'));
    headRow.appendChild(th('Observed (Station)'));
    headRow.appendChild(th('Observed (BrightSky)'));
    headRow.appendChild(th(`Forecast (${model && model.label ? model.label : 'Model'})`));
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');

    function addRow(metric, stationVal, stationTime, brightVal, brightTime, fcVal, fcTime) {
      const tr = document.createElement('tr');
      tr.appendChild(td(metric));
      tr.appendChild(td(stationVal, asOf(stationTime)));
      tr.appendChild(td(brightVal, asOf(brightTime)));
      tr.appendChild(td(fcVal, asOf(fcTime)));
      tbody.appendChild(tr);
    }

    addRow('Air temperature (°C)', fmt(stTemp.value, '°C'), stTemp.time, fmt(bsTemp.value, '°C'), bsTemp.time, fmt(fcTemp.value, '°C'), fcTemp.time);
    addRow('Water temperature (°C)', fmt(stWater.value, '°C'), stWater.time, 'N/A', null, 'N/A', null);
    addRow('Wind speed (km/h)', 'N/A', null, fmt(bsWind.value, 'km/h'), bsWind.time, fmt(fcWind.value, 'km/h'), fcWind.time);
    addRow('Wind gust (km/h)', 'N/A', null, fmt(bsGust.value, 'km/h'), bsGust.time, fmt(fcGust.value, 'km/h'), fcGust.time);
    addRow('Wind direction (°)', 'N/A', null, fmt(bsDir.value, '°', 0), bsDir.time, fmt(fcDir.value, '°', 0), fcDir.time);
    addRow('UV index', 'N/A', null, 'N/A', null, fmt(fcUV.value, ''), fcUV.time);
    addRow('Precipitation (mm / %)', 'N/A', null, fmt(bsPrec.value, 'mm'), bsPrec.time, fcPrecProb.value != null ? fmt(fcPrecProb.value, '%', 0) : 'N/A', fcPrecProb.time);
    addRow('Cloud cover (%)', 'N/A', null, 'N/A', null, fmt(fcCloud.value, '%', 0), fcCloud.time);

    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);

    plot.appendChild(container);
  }
};

/**
 * Get available visualizers
 * @returns {Array} List of available panel names
 */
window.VisRegistry.getAvailablePanels = function() {
  return Object.keys(window.VisRegistry).filter(key => 
    typeof window.VisRegistry[key] === 'function' && key !== 'getAvailablePanels'
  );
};

/**
 * Check if a panel is available
 * @param {string} panelName - Name of the panel to check
 * @returns {boolean} True if panel is available
 */
window.VisRegistry.hasPanel = function(panelName) {
  return typeof window.VisRegistry[panelName] === 'function';
};

/**
 * Render a specific panel
 * @param {string} panelName - Name of the panel to render
 * @param {Object} data - Weather data
 * @param {Object} location - Location object
 * @param {string} model - Weather model name
 * @param {Object} config - Panel configuration
 */
window.VisRegistry.renderPanel = function(panelName, data, location, model, config = {}) {
  if (!window.VisRegistry.hasPanel(panelName)) {
    console.error(`Panel '${panelName}' not found in registry`);
    return;
  }
  
  try {
    window.VisRegistry[panelName](data, location, model, config);
  } catch (error) {
    console.error(`Error rendering panel '${panelName}':`, error);
  }
};
