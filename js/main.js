let measured_temp = null;
let measured_water_temp = null;

// ------------------------------
// 1) Define Available Locations & Models
// ------------------------------
const locations = [
  { name: "🇩🇪 Konstanz", lat: 47.6952, lon: 9.1307 },
  { name: "🇨🇭 🏔️ Chäserrugg", lat: 47.1549, lon: 9.3128 },
  { name: "🇨🇭 🏔️ Wildhaus", lat: 47.2033, lon: 9.3505 },
  { name: "🇨🇭 Zurich", lat: 47.3769, lon: 8.5417 },
  { name: "🇫🇮 Espoo", lat:60.205490, lon: 24.655899},
  { name: "🌲🌲 Fischbach", lat: 48.157652, lon: 8.487578 },
];
const models = [
  { id: "icon_d2_det", label: "🇩🇪 ICON D2 48h", model: "icon_d2", type: "deterministic" },
  { id: "icon_seamless_det", label: "🇩🇪 Seamless", model: "icon_seamless", type: "deterministic" },
  { id: "meteoswiss_icon_ch1", label: "🇨🇭 ICON CH1", model: "meteoswiss_icon_ch1", type: "deterministic" },
  { id: "meteoswiss_icon_ch2", label: "🇨🇭 ICON CH2", model: "meteoswiss_icon_ch2", type: "deterministic" },
  { id: "arpege_europe_det", label: "🇫🇷 ARPEGE Europe", model: "arpege_europe", type: "deterministic" },
  { id: "arome_france_det", label: "🇫🇷 AROME France", model: "arome_france", type: "deterministic" },
  { id: "knmi_harmonie_arome_europe_det", label: "🇳🇱 Harmonie AROME Europe", model: "knmi_harmonie_arome_europe", type: "deterministic" },
  { id: "dmi_harmonie_arome_europe_det", label: "🇩🇰 Harmonie AROME Europe", model: "dmi_harmonie_arome_europe", type: "deterministic" },
  { id: "icon_d2_ensemble", label: "🇩🇪📊 ICON EPS D2", model: "icon_d2", type: "ensemble" },
  { id: "icon_eu_ensemble", label: "🇩🇪📊 ICON EPS EU", model: "icon_eu", type: "ensemble" },
  { id: "meteoswiss_icon_ch1_ensemble", label: "🇨🇭📊 ICON CH1 EPS", model: "meteoswiss_icon_ch1", type: "ensemble" },
  { id: "meteoswiss_icon_ch2_ensemble", label: "🇨🇭📊 ICON CH2 EPS", model: "meteoswiss_icon_ch2", type: "ensemble" },
  { id: "ecmwf_ensemble_1", label: "🇪🇺📊 ECMWF EPS", model: "ecmwf_ifs025", type: "ensemble" },
  { id: "gfs025", label: "🇺🇸📊 GFS Ensemble", model: "gfs025", type: "ensemble" },
];
const locSelect = document.getElementById("locationSelect");

locations.forEach(loc => {
  const opt = document.createElement("option");
  // Store lat, lon, and name in the value (as JSON)
  opt.value = JSON.stringify({ lat: loc.lat, lon: loc.lon, name: loc.name });
  opt.textContent = loc.name;
  locSelect.appendChild(opt);
});

const modSelect = document.getElementById("modelSelect");
// models.forEach(m => {
//   const opt = document.createElement("option");
//   opt.value = m.id;  // ✅ Store `id` instead of `model`
//   opt.textContent = m.label;
//   modSelect.appendChild(opt);
// });
// // Default selections
locSelect.selectedIndex = 0;
modSelect.selectedIndex = 0;

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get("lat"));
  const lon = parseFloat(params.get("lon"));
  if (!isNaN(lat) && !isNaN(lon)) {
      const name = params.get("name") || `Custom ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      return { lat, lon, name };
  }
  return null;
}



// ------------------------------
// 2) Populate Dropdowns (Including URL-Based Location)
// ------------------------------
//locSelect = document.getElementById("locationSelect");

// Add predefined locations
// locations.forEach(loc => {
//   const opt = document.createElement("option");
//   opt.value = JSON.stringify({ lat: loc.lat, lon: loc.lon, name: loc.name });
//   opt.textContent = loc.name;
//   locSelect.appendChild(opt);
// });

// Check for location in URL
const urlLocation = getUrlParams();
if (urlLocation) {
  // Check if the location already exists in the dropdown
  let exists = false;
  for (let i = 0; i < locSelect.options.length; i++) {
    const option = locSelect.options[i];
    const optValue = JSON.parse(option.value);
    if (
      optValue.name === urlLocation.name &&
      optValue.lat === urlLocation.lat &&
      optValue.lon === urlLocation.lon
    ) {
      exists = true;
      break;
    }
  }
  // If not, add it
  if (!exists) {
    const customOpt = document.createElement("option");
    customOpt.value = JSON.stringify(urlLocation);
    customOpt.textContent = urlLocation.name;
    locSelect.appendChild(customOpt);
  }
  // Set as selected
  locSelect.value = JSON.stringify(urlLocation);
} else {
  locSelect.selectedIndex = 0;
}

// Populate Model Dropdown
models.forEach(m => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.label;
  modSelect.appendChild(opt);
});
modSelect.selectedIndex = 0;

// ------------------------------
// 3) Fetch & Plot Function
// ------------------------------
async function fetchAndPlot() {


  // // Declare selectedLoc so it can be reassigned
  // let selectedLoc = getUrlParams();
  // console.error("Selected Location (from URL)", selectedLoc);
  //if (selectedLoc === null) {
    //locSelect = document.getElementById("locationSelect");
  if (locSelect) {
      try {
          selectedLoc = JSON.parse(locSelect.value);
          console.log("Parsed selectedLoc:", selectedLoc);
      } catch (e) {
          console.error("Error parsing locSelect value:", e);
          selectedLoc = null; // Reset to null if parsing fails
      }
  } else {
      console.error("locSelect element not found");
  }
 // }
  console.error("Selected Location ", selectedLoc);

  const statusElement = document.getElementById("status");
  if (statusElement) {
      statusElement.textContent = "Checking selection...";
  }

  if (selectedLoc && selectedLoc.name === "Konstanz") {
      window.WeatherAPI.fetchKonstanzWeather((airTemp, waterTemp) => {
          document.getElementById("konstanzTemperature").textContent = 
              "Current Temperature: " + airTemp + "°C";
      });
  } else {
      document.getElementById("konstanzTemperature").textContent = "";
  }


  const selectedModel = models.find(m => m.id === modSelect.value);
  // If Konstanz is selected, fetch and display the current temperature 
  if (!selectedModel) {
    console.error("⚠️ No model found for selected value:", modSelect.value);
  } else {
    console.log("✅ Selected Model:", selectedModel);
  }

  // Use the new API module
  statusElement.textContent = "Fetching data...";
  
  // Check if API is available
  console.log("WeatherAPI available:", !!window.WeatherAPI);
  if (!window.WeatherAPI || !window.WeatherAPI.getWeatherDataWithFallback) {
    console.error("WeatherAPI not available");
    statusElement.textContent = "API not loaded";
    return;
  }
  
  try {
    const data = await window.WeatherAPI.getWeatherDataWithFallback(selectedLoc, selectedModel);
    processWeatherData(data, selectedLoc, selectedModel);
    statusElement.textContent = `Data updated at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error("Error fetching data:", err);
    statusElement.textContent = "Error fetching data";
  }
}

// Function to create continuous ensemble traces
function create_continuous_ensemble_traces(hourly, variable_name, yaxis = "y1", color = "red") {
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
}


// ------------------------------
// 4) Process Data & Plot (Using Plotly.js)
// ------------------------------
function processWeatherData(data, selectedLoc, model) {
  // Extract hourly data
  const hourly = data.hourly;
  // Convert hourly times (assumed to be ISO strings in UTC) to German local time
  //const timesUTC = hourly.time.map(t => new Date(t + "Z"));
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
  const traceTempEnsemble = create_continuous_ensemble_traces(hourly, "temperature_2m", "y1", "red");
  const traceHumEnsemble = create_continuous_ensemble_traces(hourly, "relative_humidity_2m", "y2", "blue");
  const tracePrecipEnsemble = create_continuous_ensemble_traces(hourly, "precipitation", "y3", "skyblue");
  const traceCloudEnsemble = create_continuous_ensemble_traces(hourly, "cloud_cover", "y5", "black");


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
      text: `${model.label} – ${selectedLoc.name} 📍 ${selectedLoc.lat.toFixed(2)}°N, ${selectedLoc.lon.toFixed(2)}°E, ⛰️ ${data.elevation || "N/A"}m | ☀️ ${sunrises[0] ? sunrises[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"} – 🌙 ${sunsets[0] ? sunsets[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}`,
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

  Plotly.newPlot('plot', allTraces, layout);
} // End of processWeatherData

// Initialize the plot with default selections after API is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure API is loaded
  setTimeout(() => {
    fetchAndPlot();
    
    // Re-plot when location or model changes
    document.getElementById("locationSelect").addEventListener("change", fetchAndPlot);
    document.getElementById("modelSelect").addEventListener("change", fetchAndPlot);
  }, 100);
});

// Add View Range Button Event Handlers
document.getElementById("view2d").addEventListener("click", function() {
  adjustViewRange(2);
});

document.getElementById("view5d").addEventListener("click", function() {
  adjustViewRange(5);
});

document.getElementById("viewAll").addEventListener("click", function() {
  const plotDiv = document.getElementById('plot');
  const startTime = plotDiv.getAttribute('data-start-time');
  const endTime = plotDiv.getAttribute('data-end-time');

  Plotly.relayout('plot', {
    'xaxis.range': [startTime, endTime]
  });
});

// Function to adjust view range to show a specific number of days
function adjustViewRange(days) {
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
}

// Set active style for view buttons
const viewBtns = document.querySelectorAll('.view-btn');
viewBtns.forEach(btn => {
  btn.addEventListener('click', function() {
    viewBtns.forEach(b => b.style.fontWeight = 'normal');
    this.style.fontWeight = 'bold';
  });
});
