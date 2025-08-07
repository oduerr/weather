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
  
  // Only show ensemble members if there are any
  if (memberKeys.length > 0) {
    // Add ensemble members with only the first one showing in legend
    memberKeys.forEach((key, index) => {
      traces.push({
        x: hourly.time,
        y: hourly[key],
        mode: "lines",
        name: index === 0 ? `Ensemble (${memberKeys.length} members)` : `Ensemble member ${index + 1}`,
        line: { color: color, width: 1 },
        opacity: 0.2,
        yaxis: yaxis,
        showlegend: index === 0 // Only show first member in legend
      });
    });
  }
  
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
 * @param {string} selectedPanel - Panel to render ('temperature' or 'uv_wind')
 */
window.WeatherPlot.renderWeatherData = async function(data, location, model, selectedPanel = 'temperature') {
  // Route to appropriate rendering function based on selected panel
  if (selectedPanel === 'uv_wind') {
    return window.WeatherPlot.renderUVWindData(data, location, model);
  }
  
  // Default to temperature panel
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
  
  // Debug precipitation data
  console.log("🌧️ Precipitation data:", precipitation);
  console.log("🌧️ Precipitation probability:", precipProb);
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

  // Weather Station Data Integration (Konstanz only)
  let weatherStationTraces = [];
  let brightSkyTraces = [];
  
  if (location.name && location.name.includes("Konstanz")) {
    try {
      // Use Europe/Berlin local date for observations
      const nowBerlin = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
      const currentDate = nowBerlin.split('T')[0];
      
      // Get weather station data
      const stationData = await window.WeatherAPI.getKonstanzWeatherStationData(currentDate);
      
      if (stationData.temperature.length > 0) {
        // Add weather station temperature trace
        const traceStationTemp = {
          x: stationData.times,
          y: stationData.temperature,
          mode: 'markers+lines',
          name: 'Weather Station (°C)',
          line: { color: 'darkred', width: 1 },
          marker: { size: 3, color: 'darkred' },
          yaxis: "y1"
        };
        weatherStationTraces.push(traceStationTemp);
        
        // Add water if available
        if (stationData.waterTemperature.length) {
          console.log("📊 Water temperature data available:", stationData.waterTemperature.length, "measurements");
          
          // Create water temperature trace that starts from sunset time
          const traceWaterTemp = {
            x: stationData.times,
            y: stationData.waterTemperature,
            mode: 'markers+lines',
            name: 'Water Temperature (°C)',
            line: { color: 'blue', width: 2, dash: 'dot' },
            marker: { size: 2, color: 'blue' },
            yaxis: "y1"
          };
          
          // Add the water temperature trace after the temperature trace
          weatherStationTraces.push(traceWaterTemp);
        }
      }
      
      // Get BrightSky observation data
      const brightSkyData = await window.WeatherAPI.getBrightSkyObservationData(currentDate);
      
      if (brightSkyData.temperature.length > 0) {
        console.log("📊 BrightSky observation data available:", brightSkyData.temperature.length, "measurements");
        
        // Add BrightSky temperature trace (faint color)
        const traceBrightSkyTemp = {
          x: brightSkyData.times,
          y: brightSkyData.temperature,
          mode: 'markers+lines',
          name: 'Observed Temperature (°C)',
          line: { color: 'rgba(255, 0, 0, 0.3)', width: 2 },
          marker: { size: 4, color: 'rgba(255, 0, 0, 0.4)' },
          yaxis: "y1"
        };
        brightSkyTraces.push(traceBrightSkyTemp);
        
        // Add BrightSky humidity trace (faint color)
        const traceBrightSkyHum = {
          x: brightSkyData.times,
          y: brightSkyData.humidity,
          mode: 'markers+lines',
          name: 'Observed Humidity (%)',
          line: { color: 'rgba(0, 100, 255, 0.3)', width: 2 },
          marker: { size: 4, color: 'rgba(0, 100, 255, 0.4)' },
          yaxis: "y2"
        };
        brightSkyTraces.push(traceBrightSkyHum);
        
        // Add BrightSky precipitation trace (faint color)
        const traceBrightSkyPrecip = {
          x: brightSkyData.times,
          y: brightSkyData.precipitation,
          type: 'bar',
          name: 'Observed Precipitation (mm)',
          marker: { color: 'rgba(135, 206, 235, 0.3)' },
          yaxis: "y3"
        };
        brightSkyTraces.push(traceBrightSkyPrecip);
      }
      
      console.log("✅ Added BrightSky observation data for Konstanz");
    } catch (error) {
      console.warn("Could not load weather station or BrightSky data:", error);
    }
  }

  // Row 2: Precipitation and Precipitation Probability
  // Ensure precipitation is never negative
  const cleanPrecipitation = precipitation.map(p => Math.max(0, p));
  const tracePrecip = { x: timesLocal, y: cleanPrecipitation, type: 'bar', name: 'Precipitation (mm)', marker: { color: 'skyblue' }, yaxis: "y3" };
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

  // Add weather station traces if available
  if (weatherStationTraces.length > 0) {
    allTraces = [...allTraces, ...weatherStationTraces];
  }
  
  // Add BrightSky observation traces if available
  if (brightSkyTraces.length > 0) {
    allTraces = [...allTraces, ...brightSkyTraces];
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
      // Use provided times as-is; they are already local strings for forecast
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

/**
 * Render UV index and wind data as a Plotly chart
 * @param {Object} data - Weather data object
 * @param {Object} location - Location object with lat, lon, name
 * @param {Object} model - Model object with id, type, label
 */
window.WeatherPlot.renderUVWindData = async function(data, location, model) {
  // Extract hourly data
  const hourly = data.hourly;
  const timesLocal = hourly.time;

  // Simple range - use all data
  const startTime = timesLocal[0];
  const endTime = timesLocal[timesLocal.length - 1];
  console.log(`UV/Wind data range from ${startTime} to ${endTime}`);

  // Store the data range for use by view buttons
  document.getElementById('plot').setAttribute('data-start-time', startTime);
  document.getElementById('plot').setAttribute('data-end-time', endTime);

  // Extract UV and wind data
  const uvIndex = hourly.uv_index || [];
  const uvIndexClearSky = hourly.uv_index_clear_sky || [];
  const windSpeed = hourly.wind_speed_10m || [];
  const windDirection = hourly.wind_direction_10m || [];
  const windGusts = hourly.wind_gusts_10m || [];

  // Make Date Objects for all sunrises and sunsets
  const sunrises = (data.daily && data.daily.sunrise || []).map(sunrise => new Date(sunrise));
  const sunsets = (data.daily && data.daily.sunset || []).map(sunset => new Date(sunset));

  // Build traces for UV and Wind data
  // Row 1: UV Index
  const traceUV = { 
    x: timesLocal, 
    y: uvIndex, 
    mode: 'lines+markers', 
    name: 'UV Index', 
    line: { color: 'purple', width: 3 }, 
    marker: { size: 6 },
    yaxis: "y1" 
  };
  
  const traceUVClearSky = { 
    x: timesLocal, 
    y: uvIndexClearSky, 
    mode: 'lines', 
    name: 'UV Index (Clear Sky)', 
    line: { color: 'orange', width: 2, dash: 'dash' }, 
    yaxis: "y1" 
  };

  // Row 2: Wind Speed and Gusts
  const traceWindSpeed = { 
    x: timesLocal, 
    y: windSpeed, 
    mode: 'lines', 
    name: 'Wind Speed (km/h)', 
    line: { color: 'blue', width: 2 }, 
    yaxis: "y2" 
  };
  
  const traceWindGusts = { 
    x: timesLocal, 
    y: windGusts, 
    mode: 'lines', 
    name: 'Wind Gusts (km/h)', 
    line: { color: 'red', width: 2, dash: 'dash' }, 
    yaxis: "y2" 
  };

  // Row 3: Wind Direction (as arrows or line)
  const traceWindDirection = { 
    x: timesLocal, 
    y: windDirection, 
    mode: 'lines+markers', 
    name: 'Wind Direction (°)', 
    line: { color: 'green', width: 2 }, 
    marker: { size: 4 },
    yaxis: "y3" 
  };

  // Ensemble traces for UV and Wind
  let traceUVEnsemble = [];
  let traceUVClearSkyEnsemble = [];
  let traceWindSpeedEnsemble = [];
  let traceWindGustsEnsemble = [];
  let traceWindDirectionEnsemble = [];

  if (model.type === "ensemble") {
    traceUVEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "uv_index", "y1", "purple");
    traceUVClearSkyEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "uv_index_clear_sky", "y1", "orange");
    traceWindSpeedEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "wind_speed_10m", "y2", "blue");
    traceWindGustsEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "wind_gusts_10m", "y2", "red");
    traceWindDirectionEnsemble = window.WeatherPlot.createContinuousEnsembleTraces(hourly, "wind_direction_10m", "y3", "green");
  }

  // Night shading: create rectangles for each night period
  const nightShading = [];
  if (sunrises.length > 0 && sunsets.length > 0) {
    for (let i = 0; i < sunrises.length - 1; i++) {
      nightShading.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: sunsets[i],
        x1: sunrises[i + 1],
        y0: 0, y1: 1,
        fillcolor: "rgba(0, 0, 0, 0.08)",
        layer: "below",
        line: { width: 0 }
      });
    }
  }

  // Beaufort scale boundaries for wind speed chart
  const beaufortBoundaries = [
    { force: 1, ms: 0.5, name: "B1" },
    { force: 2, ms: 1.6, name: "B2" },
    { force: 3, ms: 3.4, name: "B3" },
    { force: 4, ms: 5.5, name: "B4" },
    { force: 5, ms: 8.0, name: "B5" },
    { force: 6, ms: 10.8, name: "B6" },
    { force: 7, ms: 13.9, name: "B7" },
    { force: 8, ms: 17.2, name: "B8" },
    { force: 9, ms: 20.8, name: "B9" },
    { force: 10, ms: 24.5, name: "B10" },
    { force: 11, ms: 28.5, name: "B11" },
    { force: 12, ms: 32.7, name: "B12" }
  ];

  // Calculate wind speed range for scaling
  const windSpeedData = [...(hourly.wind_speed_10m || []), ...(hourly.wind_gusts_10m || [])];
  const maxWindSpeed = Math.max(...windSpeedData, 0);
  const minWindSpeed = Math.min(...windSpeedData, 0);
  
  // Only show Beaufort lines that fall within the data range
  const beaufortShapes = beaufortBoundaries
    .filter(boundary => boundary.ms * 3.6 <= maxWindSpeed * 1.2) // Only show if within 20% of max
    .map(boundary => ({
      type: 'line',
      x0: startTime,
      x1: endTime,
      y0: boundary.ms * 3.6, // Convert m/s to km/h
      y1: boundary.ms * 3.6,
      xref: 'x',
      yref: 'y2',
      line: { 
        color: boundary.force <= 3 ? 'green' : boundary.force <= 6 ? 'orange' : 'red',
        width: 1,
        dash: 'dot'
      },
      layer: 'below'
    }));

  // Create annotations for Beaufort boundaries (only for visible lines)
  const beaufortAnnotations = beaufortBoundaries
    .filter(boundary => boundary.ms * 3.6 <= maxWindSpeed * 1.2) // Only show if within 20% of max
    .map(boundary => {
      let text = boundary.name;
      // Add surfer emoji for Beaufort 3, 4, and 5 (optimal surfing range)
      if (boundary.force >= 3 && boundary.force <= 5) {
        text = boundary.name + ' 🏄‍♂️';
      }
      return {
        x: 0.98, // Use paper coordinates instead of data coordinates
        y: boundary.ms * 3.6,
        xref: 'paper',
        yref: 'y2',
        text: text,
        showarrow: false,
        font: { size: 10, color: boundary.force <= 3 ? 'green' : boundary.force <= 6 ? 'orange' : 'red' },
        xanchor: 'left',
        yanchor: 'middle'
      };
    });

  // "Now" vertical line
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
    // For ensemble models, show ensemble traces (which include the mean)
    allTraces = [
      ...traceUVEnsemble, ...traceUVClearSkyEnsemble, ...traceWindSpeedEnsemble, ...traceWindGustsEnsemble, ...traceWindDirectionEnsemble,
    ];
  } else {
    // For deterministic models, show individual traces
    allTraces = [
      traceUV, traceUVClearSky, traceWindSpeed, traceWindGusts, traceWindDirection
    ];
  }
  
  // Add BrightSky observation traces if available
  if (brightSkyTraces.length > 0) {
    allTraces = [...allTraces, ...brightSkyTraces];
  }

  // Find unique days for weekday annotations
  const uniqueDays = [...new Set(timesLocal.map(t => t.split("T")[0]))];
  const weekdayAnnotations = uniqueDays.map(day => {
    const noonTime = new Date(`${day}T12:00:00`);
    return {
      x: noonTime.toISOString(),
      y: 1.05,
      xref: "x",
      yref: "paper",
      text: noonTime.toLocaleDateString("en-US", { weekday: "long" }),
      showarrow: false,
      font: { size: 14, color: "black", weight: "bold" },
      align: "center"
    };
  });

  // Build layout for UV/Wind panel
  const layout = {
    title: {
      text: `${model.label} – ${location.name} 📍 ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E, ⛰️ ${data.elevation || "N/A"}m | ☀️ ${sunrises[0] ? sunrises[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"} – 🌙 ${sunsets[0] ? sunsets[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}`,
      x: 0.05,
      y: -0.05,
      xanchor: "left",
      font: { size: 12 },
      showlegend: false,
      margin: { l: 40, r: 60, t: 20, b: 10 }, // Increased right margin for annotations
    },
    showtitle: true,
    width: window.innerWidth,
    height: Math.max(window.innerHeight - 120, 400), // Mobile-friendly height
    grid: { rows: 3, columns: 1, pattern: "independent" },

    // X-axis settings
    xaxis: { 
      title: "Time (CET/CEST)", 
      tickformat: "%b %d %H:%M", 
      tickmode: "auto", 
      showgrid: true, 
      tickangle: -30, 
      rangeslider: { visible: false }, 
      anchor: "y3",
      range: [startTime, endTime]
    },

    yaxis1: { title: "UV Index", domain: [0.70, 1], color: "purple", range: [0, 12] },
    yaxis2: { 
      title: "Wind Speed (km/h)", 
      domain: [0.35, 0.70], 
      color: "blue",
      autorange: true, // Ensure auto-scaling based on data
      rangemode: 'tozero' // Start from zero
    },
    yaxis3: { title: "Wind Direction (°)", domain: [0, 0.35], color: "green", range: [0, 360] },

    shapes: [...nightShading, ...beaufortShapes, shapeNow],
    showlegend: true,
    legend: { 
      x: 0.02, 
      y: 0.98,
      bgcolor: 'rgba(255, 255, 255, 0.8)', // Semi-transparent white background
      bordercolor: 'rgba(0, 0, 0, 0.2)', // Semi-transparent border
      borderwidth: 1
    },
    annotations: [...weekdayAnnotations, ...beaufortAnnotations]
  };

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
