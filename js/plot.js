/**
 * Plot module for weather data visualization
 * Handles Plotly.js chart creation and rendering
 */

// Create global Plot object
window.WeatherPlot = {};

/**
 * Create continuous ensemble traces for ensemble models
 * @param {Object} hourly - Hourly data object
 * @param {string} variable_name - Variable name to plot
 * @param {string} yaxis - Y-axis identifier
 * @param {string} color - Line color
 * @returns {Array} Array of trace objects
 */
window.WeatherPlot.createContinuousEnsembleTraces = function(hourly, variable_name, yaxis = "y1", color = "red") {
  const traces = [];

  // Extract base variable (e.g., "temperature_2m")
  if (hourly[variable_name]) {
    traces.push({
      x: hourly.time,
      y: hourly[variable_name],
      mode: "lines",
      name: `${variable_name} (Mean)`,
      line: { color: color, width: 3 }, // Main variable in red
      yaxis: yaxis
    });
  } else {
    console.warn(`Base variable ${variable_name} not found!`);
  }

  // Extract ensemble members dynamically
  const memberKeys = Object.keys(hourly).filter(key => key.startsWith(variable_name + "_member"));
  
  memberKeys.forEach(key => {
    traces.push({
      x: hourly.time,
      y: hourly[key],
      mode: "lines",
      name: key.replace("_", " "),
      line: { color: color, width: 1 },
      opacity: 0.2,
      yaxis: yaxis
    });
  });
  
  return traces;
};

/**
 * Calculate mode (most frequent value) from ensemble members
 * @param {Object} hourly - Hourly data object
 * @param {string} variable_name - Variable name to calculate mode for
 * @returns {Array} Array of mode values for each time step
 */
window.WeatherPlot.calculateEnsembleMode = function(hourly, variable_name) {
  const memberKeys = Object.keys(hourly).filter(key => key.startsWith(variable_name) && key.includes('member'));
  const timeSteps = hourly.time.length;
  const modes = new Array(timeSteps).fill(null);

  for (let i = 0; i < timeSteps; i++) {
    const counts = {};
    let maxCount = 0;
    let modeValue = null;

    // Collect all values for the current time step across all members
    const valuesAtTimeStep = [];
    if (hourly[variable_name] && hourly[variable_name][i] !== undefined) {
        valuesAtTimeStep.push(hourly[variable_name][i]); // Include the control run if available
    }
    memberKeys.forEach(key => {
      if (hourly[key] && hourly[key][i] !== undefined) {
        valuesAtTimeStep.push(hourly[key][i]);
      }
    });

    // Calculate frequency for each value
    valuesAtTimeStep.forEach(value => {
      if (value !== null) { // Ignore null values
        counts[value] = (counts[value] || 0) + 1;
        if (counts[value] > maxCount) {
          maxCount = counts[value];
          modeValue = value;
        }
      }
    });
    modes[i] = modeValue;
  }
  return modes;
};

/**
 * Render weather data as a Plotly chart
 * @param {Object} data - Weather data object
 * @param {Object} location - Location object with lat, lon, name
 * @param {Object} model - Model object with id, type, label
 */
window.WeatherPlot.renderWeatherData = function(data, location, model) {
  // Extract hourly data
  const hourly = data.hourly;
  const timesLocal = hourly.time; // No need to convert to local time since query is already in local time

  // Simple range - use all data
  const startTime = timesLocal[0];
  const endTime = timesLocal[timesLocal.length - 1];
  console.log(`Data range from ${startTime} to ${endTime}`);

  // Store the data range for use by view buttons
  document.getElementById('plot').setAttribute('data-start-time', startTime);
  document.getElementById('plot').setAttribute('data-end-time', endTime);

  // Extract arrays (use empty arrays if missing)
  const temperature = hourly.temperature_2m || [];
  const dewPoint = hourly.dew_point_2m || [];
  const humidity = hourly.relative_humidity_2m || [];
  const precipitation = hourly.precipitation || [];
  const precipProb = hourly.precipitation_probability || [];
  const cloudCover = hourly.cloud_cover || [];
  const cloudCoverLow = hourly.cloud_cover_low || [];
  const cloudCoverMid = hourly.cloud_cover_mid || [];
  const cloudCoverHigh = hourly.cloud_cover_high || [];
  const visibility = (hourly.visibility || []).map(v => v / 1000);
  const weatherCode = hourly.weather_code || [];
  const sunshinePercentage = (hourly.sunshine_duration || []).map(v => v / 3600 * 100);  // Sunshine Percentage

  // Weather icons mapping
  const weatherIconMap = {
    "0": "☀️", "1": "🌤️", "2": "⛅", "3": "☁️",
    "45": "🌫️", "48": "🌫️", "51": "🌦️", "53": "🌦️",
    "55": "🌦️", "56": "🌧️", "57": "🌧️", "61": "🌧️",
    "63": "🌧️", "65": "🌧️", "66": "🌧️", "67": "🌧️",
    "71": "🌨️", "73": "🌨️", "75": "🌨️", "77": "❄️",
    "80": "🌦️", "81": "🌦️", "82": "🌧️", "85": "🌨️",
    "86": "🌨️", "95": "⛈️", "96": "⛈️", "99": "⛈️"
  };
  const weatherIcons = weatherCode.map(code => weatherIconMap[code] || "");

  // Make Date Objects for all sunrises and sunsets
  const sunrises = (data.daily && data.daily.sunrise || []).map(sunrise => new Date(sunrise));
  const sunsets = (data.daily && data.daily.sunset || []).map(sunset => new Date(sunset));

  // Build traces for 3 rows:
  // Row 1: Temperature, Dew Point, Humidity, and Weather Icons
  const traceTemp = { x: timesLocal, y: temperature, mode: 'lines', name: 'Temperature (°C)', line: { color: 'red' }, yaxis: "y1" };
  const traceDew = { x: timesLocal, y: dewPoint, mode: 'lines', name: 'Dew Point (°C)', line: { color: 'red', width: 1, dash: 'dot' }, opacity: 0.6, yaxis: "y1" };
  const traceIcons = { x: timesLocal, y: temperature.map(t => t + 1), mode: 'text', text: weatherIcons, textfont: { size: 18 }, name: 'Weather', yaxis: "y1" };
  // Humidity on secondary y-axis
  const traceHum = { x: timesLocal, y: humidity, mode: 'lines', name: 'Humidity (%)', line: { color: 'royalblue' }, yaxis: "y2" };

  // Row 2: Precipitation and Precipitation Probability
  const tracePrecip = { x: timesLocal, y: precipitation, type: 'bar', name: 'Precipitation (mm)', marker: { color: 'skyblue' }, yaxis: "y3" };
  // Precipitation Probability and Sunshine Percentage on secondary y-axis
  const tracePrecipProb = { x: timesLocal, y: precipProb, mode: 'lines', name: 'Precipitation Prob (%)', line: { color: 'green' }, yaxis: "y4" };
  const traceSunshine = { x: timesLocal, y: sunshinePercentage, mode: 'lines', name: 'Sunshine (%)', line: { color: '#FFA500' }, yaxis: "y4" };

  // Row 3: Cloud Cover and Visibility
  // Create cloud cover "tiles" using a scale function
  const scaleCloud = (values, center) => {
    const up = values.map(v => center + (v / 12));
    const down = values.map(v => center - (v / 12));
    return { up, down };
  };
  const lowCloud = scaleCloud(cloudCoverLow, 25);
  const midCloud = scaleCloud(cloudCoverMid, 50);
  const highCloud = scaleCloud(cloudCoverHigh, 75);

  const xMirror = timesLocal.concat([...timesLocal].reverse());
  const traceCloudLow = { x: xMirror, y: lowCloud.up.concat(lowCloud.down.reverse()), fill: 'toself', mode: 'lines', name: 'Cloud Cover Low', line: { color: 'lightblue', width: 1 }, opacity: 0.6, yaxis: "y5" };
  const traceCloudMid = { x: xMirror, y: midCloud.up.concat(midCloud.down.reverse()), fill: 'toself', mode: 'lines', name: 'Cloud Cover Mid', line: { color: 'gray', width: 1 }, opacity: 0.6, yaxis: "y5" };
  const traceCloudHigh = { x: xMirror, y: highCloud.up.concat(highCloud.down.reverse()), fill: 'toself', mode: 'lines', name: 'Cloud Cover High', line: { color: 'black', width: 1 }, opacity: 0.6, yaxis: "y5" };
  const traceCloudTotal = { x: timesLocal, y: cloudCover, mode: 'lines', name: 'Total Cloud Cover', line: { color: 'black', width: 2 }, yaxis: "y5" };
  const traceVisibility = { x: timesLocal, y: visibility, mode: 'lines', name: 'Visibility (km)', line: { color: 'brown', width: 2, dash: 'dot' }, yaxis: "y6" };

  // Ensemble traces for temperature
  const traceTempEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "temperature_2m", "y1", "red");
  const traceHumEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "relative_humidity_2m", "y2", "blue");
  const tracePrecipEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "precipitation", "y3", "skyblue");
  const traceCloudEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "cloud_cover", "y5", "black");
  
  // Weather code ensemble mode trace
  let traceWeatherCodeEnsemble = [];
  if (model.type === "ensemble" && hourly.weather_code) {
    const weatherCodeMode = window.WeatherPlot.calculateEnsembleMode(hourly, "weather_code");
    const weatherCodeModeIcons = weatherCodeMode.map(code => weatherIconMap[code] || "");
    
    traceWeatherCodeEnsemble = [{
      x: timesLocal,
      y: temperature.map(t => t + 2), // Position slightly above temperature
      mode: 'text',
      text: weatherCodeModeIcons,
      textfont: { size: 20, color: 'purple' },
      name: 'Weather Code Mode',
      yaxis: "y1"
    }];
  }

  // Night shading: create rectangles for each night period
  const nightShading = [];
  if (sunrises.length > 0 && sunsets.length > 0) {
    for (let i = 0; i < sunrises.length - 1; i++) {
      // Define the night period as the time between sunset[i] and sunrise[i+1]
      nightShading.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: sunsets[i],   // Start of the night (sunset)
        x1: sunrises[i + 1], // End of the night (next sunrise)
        y0: 0, y1: 1,  // Full height (paper coordinates from 0 to 1)
        fillcolor: "rgba(0, 0, 0, 0.08)", // Semi-transparent black for night shading
        layer: "below",
        line: { width: 0 }
      });
    }
  }

  // "Now" vertical line (using current local time)
  const now_local_iso = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
  const shapeNow = {
    type: 'line',
    x0: now_local_iso,
    x1: now_local_iso,
    y0: 0,
    y1: 1,
    xref: 'x',
    yref: 'paper',
    line: { color: 'red', dash: 'dash', width: 2 }
  };

  // Build all traces
  let allTraces;
  if (model.type === "ensemble") {
    allTraces = [
      ...traceTempEnsemble, ...traceHumEnsemble, ...tracePrecipEnsemble, ...traceCloudEnsemble,
      ...traceWeatherCodeEnsemble,
    ];
  } else {
    allTraces = [
      traceTemp, traceDew, traceHum, traceIcons,
      tracePrecip, tracePrecipProb, traceSunshine,
      traceCloudLow, traceCloudMid, traceCloudHigh, traceCloudTotal,
      traceVisibility
    ];
  }

  // Build layout: using grid for 3 rows and a lower separate x-axis for date labels (if desired)
  // Step 1: Find the unique days in the dataset
  const uniqueDays = [...new Set(timesLocal.map(t => t.split("T")[0]))];

  // Step 2: Create annotations at noon for each day
  const weekdayAnnotations = uniqueDays.map(day => {
    const noonTime = new Date(`${day}T12:00:00`);  // Set noon time
    return {
      x: noonTime.toISOString(),   // X position at noon
      y: 1.05,                     // Y position (above first row)
      xref: "x",
      yref: "paper",
      text: noonTime.toLocaleDateString("en-US", { weekday: "long" }), // "Monday", "Tuesday", etc.
      showarrow: false,
      font: { size: 14, color: "black", weight: "bold" },
      align: "center"
    };
  });

  // Step 3: Add the annotations to the layout
  const layout = {
    title: {
      text: `${model.label} – ${location.name} 📍 ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E, ⛰️ ${data.elevation || "N/A"}m | ☀️ ${sunrises[0] ? sunrises[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"} – 🌙 ${sunsets[0] ? sunsets[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}`,
      x: 0.05, // Align title to the left
      y: -0.05, // Move title up slightly
      xanchor: "left",
      font: { size: 12 }, // Small font for compactness
      showlegend: false,
      margin: { l: 40, r: 20, t: 20, b: 10 },
    },
    showtitle: true,
    width: window.innerWidth,
    height: window.innerHeight * 0.98,
    grid: { rows: 3, columns: 1, pattern: "independent" },

    // X-axis settings - default to showing all data
    xaxis: { 
      title: "Time (CET/CEST)", 
      tickformat: "%b %d %H:%M", 
      tickmode: "auto", 
      showgrid: true, 
      tickangle: -30, 
      rangeslider: { visible: false }, 
      anchor: "y5",
      range: [startTime, endTime]
    },

    yaxis1: { title: "Temp (°C)", domain: [0.70, 1], color: "red" },  // 🔼 Slightly larger top row
    yaxis2: { title: "Humidity (%)", overlaying: "y", side: "right", color: "blue" },

    yaxis3: { title: "🌧️ (mm)", domain: [0.45, 0.70], color: "skyblue" },  // 🔽 Smaller middle row
    yaxis4: { title: "🌧️ Prob % | ☀️ %", overlaying: "y3", side: "right", color: "black" },

    yaxis5: { title: "Cloud Cover (%)", domain: [0, 0.35] },  // 🔼 More space for bottom row
    yaxis6: { title: "Visibility (km)", overlaying: "y5", side: "right", range: [0, 100], color: "darkred" },

    shapes: [...nightShading, shapeNow],
    showlegend: false,  // Hide legend
    annotations: weekdayAnnotations  // ✅ Add weekday labels at noon
  }; // End of layout

  Plotly.newPlot('plot', allTraces, layout).then(() => {
    // Set initial view to show all data (no empty days)
    const plotDiv = document.getElementById('plot');
    const startTime = plotDiv.getAttribute('data-start-time');
    const endTime = plotDiv.getAttribute('data-end-time');
    
    // Set the initial view to exactly match the data range
    Plotly.relayout('plot', {
      'xaxis.range': [startTime, endTime]
    });
  });
};

/**
 * Adjust view range to show a specific number of days
 * @param {number} days - Number of days to show
 */
window.WeatherPlot.adjustViewRange = function(days) {
  const plotDiv = document.getElementById('plot');
  const startTime = new Date(plotDiv.getAttribute('data-start-time'));
  const endTime = new Date(plotDiv.getAttribute('data-end-time'));

  // Current time
  const now = new Date();

  // Calculate view boundaries
  const msPerDay = 24 * 60 * 60 * 1000;
  const viewStart = new Date(Math.max(startTime, now - msPerDay * 0.5)); // half day before now
  const viewEnd = new Date(Math.min(endTime, new Date(viewStart.getTime() + days * msPerDay)));

  // Format as ISO strings for plotly
  const viewStartISO = viewStart.toISOString().replace('Z', '');
  const viewEndISO = viewEnd.toISOString().replace('Z', '');

  Plotly.relayout('plot', {
    'xaxis.range': [viewStartISO, viewEndISO]
  });
};
