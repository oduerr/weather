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

// ------------------------------
// 4) Process Data & Plot (Using Plotly.js)
// ------------------------------
function processWeatherData(data, selectedLoc, model) {
  // Use the plot module to render the weather data
  window.WeatherPlot.renderWeatherData(data, selectedLoc, model);
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
  window.WeatherPlot.adjustViewRange(2);
});

document.getElementById("view5d").addEventListener("click", function() {
  window.WeatherPlot.adjustViewRange(5);
});

document.getElementById("viewAll").addEventListener("click", function() {
  const plotDiv = document.getElementById('plot');
  const startTime = plotDiv.getAttribute('data-start-time');
  const endTime = plotDiv.getAttribute('data-end-time');

  Plotly.relayout('plot', {
    'xaxis.range': [startTime, endTime]
  });
});

// Set active style for view buttons
const viewBtns = document.querySelectorAll('.view-btn');
viewBtns.forEach(btn => {
  btn.addEventListener('click', function() {
    viewBtns.forEach(b => b.style.fontWeight = 'normal');
    this.style.fontWeight = 'bold';
  });
});
