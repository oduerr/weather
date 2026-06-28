let measured_temp = null;
let measured_water_temp = null;


// ------------------------------
// 1) Configuration and Panel System
// ------------------------------

// Import configuration (using global objects for file:// compatibility)
// Note: In a real ES module setup, this would be:
// import { PANELS, PANEL_CONFIG, WEATHER_MODELS, LOCATIONS, DEFAULT_SETTINGS } from './config/appConfig.js';

// For now, we'll define the configuration inline to maintain file:// compatibility
const PANELS = ['temperature', 'overview', 'uv_wind', 'actuals', 'compare', 'hourly'];
const PANEL_CONFIG = {
  hourly: {
    enabled: true,
    title: 'Hourly',
    description: 'Swipeable hour tiles: symbol, temp, UV, wind, precipitation',
    defaultView: '2d',
    showEnsemble: false,
    showCurrent: false
  },
  temperature: {
    enabled: true,
    title: 'Temperature',
    description: 'Temperature forecast with ensemble data',
    defaultView: '2d',
    showEnsemble: true,
    showCurrent: true
  },
  overview: {
    enabled: true,
    title: 'Overview',
    description: 'Daily overview with morning/midday/evening slices',
    defaultView: '5d',
    showEnsemble: true,
    showCurrent: false
  },
  uv_wind: {
    enabled: true,
    title: 'UV Index & Wind',
    description: 'UV index and wind information with ensemble data',
    defaultView: '2d',
    showEnsemble: true,
    showCurrent: true
  },
  actuals: {
    enabled: true,
    title: 'Actuals',
    description: 'Observed vs Forecast numeric values',
    defaultView: '2d',
    showEnsemble: false,
    showCurrent: false
  },
  compare: {
    enabled: true,
    title: 'Compare',
    description: 'Overlay multiple weather models on one chart',
    defaultView: '2d',
    showEnsemble: false,
    showCurrent: false
  }
};

// Available locations and models 
const locations = [
  { name: "🇩🇪 Konstanz", lat: 47.6952, lon: 9.1307 },
  { name: "🇨🇭 🏔️ Chäserrugg", lat: 47.1549, lon: 9.3128 },
  { name: "🇨🇭 🏔️ Wildhaus", lat: 47.2033, lon: 9.3505 },
  { name: "🇨🇭 Zurich", lat: 47.3769, lon: 8.5417 },
  { name: "🇫🇮 Espoo", lat:60.205490, lon: 24.655899},
  { name: "🌲🌲 Fischbach", lat: 48.157652, lon: 8.487578 }
];

// Model information for display purposes (typical expected ranges)
// Note: API always requests 16 days and uses whatever data is returned
const MODEL_INFO = {
  // Machine Learning / AI
  'ecmwf_aifs025_single': { days: '10', category: 'Machine Learning' },
  'gfs_graphcast025': { days: '10', category: 'Machine Learning' },

  // Ultra high-resolution models (typically 1-3 days)
  'icon_d2': { days: '~2', category: 'Ultra High-Res' },  // ICON D2 48h
  'arome_france': { days: '~2', category: 'Ultra High-Res' },  // AROME 42h
  'meteofrance_arome_france_hd': { days: '~2', category: 'Ultra High-Res' },
  'meteoswiss_icon_ch1': { days: '~1', category: 'Ultra High-Res' },  // MeteoSwiss CH1 33h
  'knmi_harmonie_arome_europe': { days: '~2', category: 'Ultra High-Res' },  // Harmonie 48h
  'dmi_harmonie_arome_europe': { days: '~2', category: 'Ultra High-Res' },  // Harmonie 48h
  'ukmo_uk_deterministic_2km': { days: '~2', category: 'Ultra High-Res' },
  'geosphere_arome_austria': { days: '~2', category: 'Ultra High-Res' },
  'italia_meteo_arpae_icon_2i': { days: '~2', category: 'Ultra High-Res' },
  
  // Regional models (typically 3-5 days)
  'meteoswiss_icon_ch2': { days: '~5', category: 'Regional' },  // MeteoSwiss CH2 120h
  'arpege_europe': { days: '~4', category: 'Regional' },  // ARPEGE 96h
  
  // Global models (typically 7+ days)
  'best_match': { days: '16', category: 'Global' },  // Best Match
  'icon_seamless': { days: '~7', category: 'Global' },  // ICON Seamless
  'icon_eu': { days: '~7', category: 'Global' },  // ICON EU
  'icon_global': { days: '~7', category: 'Global' }, // ICON Global
  'gfs_global': { days: '16', category: 'Global' }, // GFS Global
  'ukmo_global_deterministic_10km': { days: '8', category: 'Global' }, // UKMO Global
  'meteofrance_arpege_world': { days: '8', category: 'Global' },
  'gem_global': { days: '7', category: 'Global' }, // GEM Global
  'jma_gsm': { days: '7', category: 'Global' }, // JMA Global
  'bom_access_global': { days: '7', category: 'Global' }, // BOM ACCESS Global
  'kma_gdps': { days: '7', category: 'Global' },
  'gfs025': { days: '10+', category: 'Global Extended' },  // GFS Ensemble
  'ecmwf_ifs025': { days: '10+', category: 'Global Extended' },  // ECMWF Ensemble
  
  // Default for unknown models
  'default': { days: '16d', category: 'Global' }
};

// Function to get enhanced model label
function getEnhancedModelLabel(model) {
  const baseModel = model.model.replace('_ensemble', '').replace('_det', '');
  const info = MODEL_INFO[baseModel] || MODEL_INFO['default'];
  const typeIcon = model.type === 'ensemble' ? '📊' : '';
  
  return `${model.label} ${typeIcon} (${info.days}d, ${info.category})`;
}
const models = [
  { id: "bestmatch", label: "🇩🇪 Best Match", model: "best_match", type: "deterministic" },
  // 2) German Models (DWD)
  { id: "icon_d2_det", label: "🇩🇪 ICON D2 48h", model: "icon_d2", type: "deterministic" },
  { id: "icon_seamless_det", label: "🇩🇪 Seamless", model: "icon_seamless", type: "deterministic" },
  { id: "icon_eu_det", label: "🇩🇪 ICON EU", model: "icon_eu", type: "deterministic" },
  { id: "icon_global_det", label: "🇩🇪 ICON Global", model: "icon_global", type: "deterministic" },
  { id: "icon_d2_ensemble", label: "🇩🇪📊 ICON EPS D2", model: "icon_d2", type: "ensemble" },
  { id: "icon_eu_ensemble", label: "🇩🇪📊 ICON EPS EU", model: "icon_eu", type: "ensemble" },
  { id: "icon_global_ensemble", label: "🇩🇪📊 ICON EPS Global", model: "icon_global", type: "ensemble" },

  // 3) Swiss Models (MeteoSwiss)
  { id: "meteoswiss_icon_ch1", label: "🇨🇭 ICON CH1", model: "meteoswiss_icon_ch1", type: "deterministic" },
  { id: "meteoswiss_icon_ch2", label: "🇨🇭 ICON CH2", model: "meteoswiss_icon_ch2", type: "deterministic" },
  { id: "meteoswiss_icon_ch1_ensemble", label: "🇨🇭📊 ICON CH1 EPS", model: "meteoswiss_icon_ch1", type: "ensemble" },
  { id: "meteoswiss_icon_ch2_ensemble", label: "🇨🇭📊 ICON CH2 EPS", model: "meteoswiss_icon_ch2", type: "ensemble" },

  // 4) French Models (Météo-France)
  { id: "arome_france_hd_det", label: "🇫🇷 AROME France HD", model: "meteofrance_arome_france_hd", type: "deterministic" },
  { id: "arome_france_det", label: "🇫🇷 AROME France", model: "arome_france", type: "deterministic" },
  { id: "arpege_europe_det", label: "🇫🇷 ARPEGE Europe", model: "arpege_europe", type: "deterministic" },
  { id: "arpege_world_det", label: "🇫🇷 ARPEGE World", model: "meteofrance_arpege_world", type: "deterministic" },


  // 5) German Models (DWD)  // 1) Machine Learning / AI
  { id: "ecmwf_aifs_det", label: "🇪🇺 ECMWF AIFS (ML)", model: "ecmwf_aifs025_single", type: "deterministic" },
  { id: "gfs_graphcast_det", label: "🇺🇸 GFS GraphCast (ML)", model: "gfs_graphcast025", type: "deterministic" },
  
  // 5) Other European & Global Models
  { id: "ecmwf_ifs025_det", label: "🇪🇺 ECMWF IFS", model: "ecmwf_ifs025", type: "deterministic" },
  { id: "gfs_global_det", label: "🇺🇸 GFS Global", model: "gfs_global", type: "deterministic" },
  { id: "ukmo_global_det", label: "🇬🇧 UKMO Global", model: "ukmo_global_deterministic_10km", type: "deterministic" },
  { id: "ukmo_uk_deterministic_2km_det", label: "🇬🇧 UKMO UK 2km", model: "ukmo_uk_deterministic_2km", type: "deterministic" },
  { id: "gem_global_det", label: "🇨🇦 GEM Global", model: "gem_global", type: "deterministic" },
  { id: "jma_gsm_det", label: "🇯🇵 JMA Global", model: "jma_gsm", type: "deterministic" },
  { id: "bom_access_global_det", label: "🇦🇺 BOM ACCESS Global", model: "bom_access_global", type: "deterministic" },
  { id: "kma_gdps_det", label: "🇰🇷 KMA GDPS Global", model: "kma_gdps", type: "deterministic" },
  { id: "knmi_harmonie_arome_europe_det", label: "🇳🇱 Harmonie AROME Europe", model: "knmi_harmonie_arome_europe", type: "deterministic" },
  { id: "dmi_harmonie_arome_europe_det", label: "🇩🇰 Harmonie AROME Europe", model: "dmi_harmonie_arome_europe", type: "deterministic" },
  
  // Ensemble models
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
window.allModels = models;  // exposed for ComparePanel.renderControls
// models.forEach(m => {
//   const opt = document.createElement("option");
//   opt.value = m.id;  // ✅ Store `id` instead of `model`
//   opt.textContent = m.label;
//   modSelect.appendChild(opt);
// });
// // Default selections
locSelect.selectedIndex = 0;
modSelect.selectedIndex = 0;

// Function to get all URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  
  // Location parameters
  const lat = parseFloat(params.get("lat"));
  const lon = parseFloat(params.get("lon"));
  const locationData = (!isNaN(lat) && !isNaN(lon)) ? {
    lat, lon, 
    name: params.get("name") || `Custom ${lat.toFixed(4)}, ${lon.toFixed(4)}`
  } : null;
  
  // Model parameter
  const model = params.get("model");
  
  // Panel parameter  
  const panel = params.get("panel");
  
  // View parameter (for time range)
  const view = params.get("view");
  
  return {
    location: locationData,
    model: model,
    panel: panel,
    view: view
  };
}

// Function to update URL with all current app state
function updateUrlWithAppState(location, model, panel, view) {
  if (!location) return;
  
  const params = new URLSearchParams();
  params.set("lat", location.lat);
  params.set("lon", location.lon);
  params.set("name", location.name);
  
  if (model) params.set("model", model);
  if (panel) params.set("panel", panel);
  if (view) params.set("view", view);
  
  const baseUrl = window.location.origin + window.location.pathname;
  const newUrl = `${baseUrl}?${params.toString()}`;
  
  window.history.pushState({ 
    location: location,
    model: model,
    panel: panel,
    view: view
  }, '', newUrl);
  
  console.log("Updated URL with app state:", { location: location.name, model, panel, view });
}

// Function to get current app state
function getCurrentAppState() {
  const locationSelect = document.getElementById('locationSelect');
  const modelSelect = document.getElementById('modelSelect');
  const panelSelect = document.getElementById('panelSelect');
  
  let currentLocation = null;
  const specialOptions = ['MAP_PICKER', 'SEARCH_LOCATION', 'CURRENT_LOCATION'];
  
  // Get current location
  if (locationSelect && locationSelect.value && !specialOptions.includes(locationSelect.value)) {
    try {
      currentLocation = JSON.parse(locationSelect.value);
    } catch (e) {
      // Try URL params as fallback
      const urlParams = getUrlParams();
      currentLocation = urlParams.location;
    }
  } else {
    // Try URL params as fallback
    const urlParams = getUrlParams();
    currentLocation = urlParams.location;
  }
  
  return {
    location: currentLocation,
    model: modelSelect ? modelSelect.value : null,
    panel: panelSelect ? panelSelect.value : null,
    view: null // Will be determined by view buttons
  };
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

// Check for all parameters in URL
const urlParams = getUrlParams();
const urlLocation = urlParams.location;
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

// Populate Model Dropdown with enhanced labels
function populateModelDropdown() {
  modSelect.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = getEnhancedModelLabel(m);
    modSelect.appendChild(opt);
  });
}
populateModelDropdown();

// Set model from URL or default
if (urlParams.model && models.find(m => m.id === urlParams.model)) {
  modSelect.value = urlParams.model;
  console.log("Set model from URL:", urlParams.model);
} else {
  modSelect.selectedIndex = 0;
}

// Set panel from URL or default
const panelSelect = document.getElementById('panelSelect');
if (urlParams.panel && panelSelect) {
  const validPanels = ['temperature', 'overview', 'uv_wind', 'actuals', 'compare', 'hourly'];
  if (validPanels.includes(urlParams.panel)) {
    panelSelect.value = urlParams.panel;
  }
} else if (panelSelect) {
  // Default panel: Overview on mobile (touch-friendly, links into Hourly),
  // Compare on larger screens. Breakpoint matches the CSS mobile media query.
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  panelSelect.value = isMobile ? 'overview' : 'compare';
}

function updateModelRowVisibility() {
  const panel = document.getElementById('panelSelect').value;
  const row = document.getElementById('model-row');
  if (row) row.style.display = panel === 'compare' ? 'none' : 'flex';
  const dewCtrl = document.getElementById('dew-point-control');
  if (dewCtrl) dewCtrl.style.display = panel === 'temperature' ? 'flex' : 'none';
}
updateModelRowVisibility();

// ------------------------------
// 3) Fetch & Plot Function
// ------------------------------
// Make fetchAndPlot globally accessible for location search integration
function toggleHelpOverlay() {
  const existing = document.getElementById('help-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'help-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:14px;padding:24px 28px;max-width:480px;width:90vw;box-shadow:0 8px 40px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-height:90vh;overflow-y:auto;';

  const sections = [
    { title: '⏱ View Range', rows: [
      ['1', '1 day'], ['2', '2 days'], ['5', '5 days'], ['a', 'All data'],
    ]},
    { title: '📊 Panels', rows: [
      ['t', 'Temperature'], ['u', 'UV & Wind'], ['w', 'UV & Wind'], ['c', 'Compare'], ['o', 'Overview'], ['r', 'Open Radar'],
    ]},
    { title: '🧭 Navigation', rows: [
      ['← →', 'Pan time axis'], ['↑ ↓', 'Cycle panels'],
      ['Swipe ←→', 'Pan time (controls hidden)'], ['Swipe ↑↓', 'Switch panel (controls hidden)'],
    ]},
    { title: '🖥 Display', rows: [
      ['Esc', 'Show / hide controls'], ['?', 'This help screen'],
    ]},
  ];

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    + '<h2 style="margin:0;font-size:17px;font-weight:700;">⌨️ Keyboard Shortcuts</h2>'
    + '<span id="help-close" style="cursor:pointer;font-size:20px;line-height:1;color:#666;">✕</span>'
    + '</div>';

  sections.forEach(s => {
    html += `<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:6px;">${s.title}</div>`;
    html += '<table style="width:100%;border-collapse:collapse;">';
    s.rows.forEach(([key, desc]) => {
      html += `<tr>
        <td style="padding:3px 0;width:110px;">
          ${key.split(' ').map(k => `<kbd style="display:inline-block;padding:2px 7px;border:1px solid #ccc;border-radius:4px;font-size:12px;font-family:monospace;background:#f5f5f5;margin-right:2px;">${k}</kbd>`).join('')}
        </td>
        <td style="padding:3px 0;font-size:13px;color:#333;">${desc}</td>
      </tr>`;
    });
    html += '</table></div>';
  });

  html += '<div style="border-top:1px solid #eee;margin-top:12px;padding-top:10px;text-align:center;font-size:12px;color:#888;">'
       + '<a href="https://github.com/oduerr/weather" target="_blank" rel="noopener" style="color:#007AFF;text-decoration:none;">⬡ GitHub — oduerr/weather</a>'
       + '</div>';

  box.innerHTML = html;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  box.querySelector('#help-close').addEventListener('click', () => overlay.remove());
}

function showForecastError(message) {
  document.getElementById('forecast-error-banner')?.remove();
  const banner = document.createElement('div');
  banner.id = 'forecast-error-banner';
  banner.style.cssText = [
    'position:fixed', 'top:80px', 'left:50%', 'transform:translateX(-50%)',
    'background:#c0392b', 'color:white', 'padding:12px 20px', 'border-radius:8px',
    'font-size:13px', 'font-weight:bold', 'z-index:500', 'max-width:90vw',
    'text-align:center', 'box-shadow:0 4px 16px rgba(0,0,0,0.4)', 'line-height:1.5'
  ].join(';');
  banner.innerHTML = `⚠️ Open-Meteo forecast unavailable<br><span style="font-weight:normal;font-size:12px">${message}</span><br><span style="font-weight:normal;font-size:11px;opacity:0.85">BrightSky &amp; station data may still show on the Temperature panel</span>`;
  const close = document.createElement('span');
  close.textContent = ' ✕';
  close.style.cssText = 'cursor:pointer;margin-left:10px;opacity:0.8;';
  close.onclick = () => banner.remove();
  banner.appendChild(close);
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 15000);
}

window.fetchAndPlot = async function fetchAndPlot() {


  // Get selected location with proper fallback handling
  if (locSelect) {
    // Handle special dropdown options that are not location data
    const specialOptions = ['MAP_PICKER', 'SEARCH_LOCATION', 'CURRENT_LOCATION'];
    
    if (specialOptions.includes(locSelect.value)) {
      selectedLoc = getUrlParams(); // Use URL parameters if available
      console.log(`${locSelect.value} selected, using URL params:`, selectedLoc);
    } else if (locSelect.value) {
      try {
        selectedLoc = JSON.parse(locSelect.value);
        console.log("Parsed selectedLoc from dropdown:", selectedLoc);
      } catch (e) {
        console.error("Error parsing locSelect value:", e);
        selectedLoc = getUrlParams(); // Fallback to URL parameters
      }
    } else {
      selectedLoc = getUrlParams(); // Fallback to URL parameters
    }
  } else {
    console.error("locSelect element not found");
    selectedLoc = getUrlParams(); // Fallback to URL parameters
  }

  // Final fallback to Konstanz if nothing else works
  if (!selectedLoc) {
    selectedLoc = { lat: 47.6952, lon: 9.1307, name: 'Konstanz (Default)' };
    console.log("Using default location:", selectedLoc);
  }

  console.info("Final Selected Location:", selectedLoc);

  // Status element removed to save space

  if (selectedLoc && selectedLoc.name === "Konstanz") {
      window.WeatherAPI.fetchKonstanzWeather((airTemp, waterTemp) => {
          if (isNaN(airTemp) || airTemp === "N/A") {
              document.getElementById("konstanzTemperature").textContent = "Weather data unavailable";
          } else {
              document.getElementById("konstanzTemperature").textContent =
                  "Current Temperature: " + airTemp + "°C";
          }
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
  // Status element removed to save space
  
  // Check if API is available
  console.log("WeatherAPI available:", !!window.WeatherAPI);
  if (!window.WeatherAPI || !window.WeatherAPI.getWeatherDataWithFallback) {
    console.error("WeatherAPI not available");
    return;
  }

  // ── Compare panel: fetch multiple models in parallel, then early-return ──
  {
    const _panelSelect = document.getElementById('panelSelect');
    const _panel = _panelSelect ? _panelSelect.value : 'overview';
    if (_panel === 'compare' && window.ComparePanel) {
      const compareModels = (window.ComparePanel.selectedModelIds || [])
        .map(id => models.find(m => m.id === id))
        .filter(Boolean);
      if (compareModels.length === 0) {
        // Render empty state with controls still visible
        window.VisRegistry.renderPanel('compare',
          { models: [], allData: [] }, selectedLoc, null, PANEL_CONFIG.compare || {});
        return;
      }
      try {
        const allData = await Promise.all(
          compareModels.map(m =>
            window.WeatherAPI.getWeatherDataWithFallback(selectedLoc, m)
              .catch(err => { console.warn(`Compare: failed ${m.id}:`, err); return null; })
          )
        );
        const validModels = compareModels.filter((_, i) => allData[i] !== null);
        const validData   = allData.filter(Boolean);
        window.VisRegistry.renderPanel('compare',
          { models: validModels, allData: validData }, selectedLoc, null, PANEL_CONFIG.compare || {});
      } catch (err) {
        console.error('Compare panel error:', err);
      }
      return;
    }
  }
  // ── End compare branch ──

  try {
    const data = await window.WeatherAPI.getWeatherDataWithFallback(selectedLoc, selectedModel);

    if (data.forecastError) {
      showForecastError(data.forecastError);
      return;
    }
    document.getElementById('forecast-error-banner')?.remove();

    // Get the selected panel from the dropdown
    const panelSelect = document.getElementById('panelSelect');
    const selectedPanel = panelSelect ? panelSelect.value : 'overview';
    
    // Render only the selected panel
    const panelConfig = PANEL_CONFIG[selectedPanel];
    if (panelConfig && panelConfig.enabled) {
      console.log(`Rendering panel: ${selectedPanel}`);
      
      // Use the visualizer registry to render the panel
      if (window.VisRegistry && window.VisRegistry.renderPanel) {
        window.VisRegistry.renderPanel(selectedPanel, data, selectedLoc, selectedModel, panelConfig);
      } else {
        // Fallback to direct rendering if registry is not available
        await processWeatherData(data, selectedLoc, selectedModel, selectedPanel);
      }
    } else {
      console.error(`Panel '${selectedPanel}' not found or not enabled`);
    }
    
    // Data updated successfully (status element removed to save space)
  } catch (err) {
    console.error("Error fetching data:", err);
    showForecastError(err.message || 'Unknown error — check your connection.');
  }
};

// ------------------------------
// 4) Process Data & Plot (Using Plotly.js)
// ------------------------------
async function processWeatherData(data, selectedLoc, model, selectedPanel = 'overview') {
  // Use the plot module to render the weather data
  await window.WeatherPlot.renderWeatherData(data, selectedLoc, model, selectedPanel);
} // End of processWeatherData

// ------------------------------
// Viewport Preserver (Feature 3)
// ------------------------------
window.ViewportPreserver = {
  pending: null,
  lastAppliedAt: 0,
  getActivePlotDiv() {
    const compareChart = document.getElementById('compare-chart');
    if (compareChart && compareChart.classList && compareChart.classList.contains('js-plotly-plot')) {
      return compareChart;
    }
    const plotDiv = document.getElementById('plot');
    if (plotDiv && plotDiv.classList && plotDiv.classList.contains('js-plotly-plot')) {
      return plotDiv;
    }
    return null;
  },
  capture() {
    try {
      const activeDiv = this.getActivePlotDiv();
      if (!activeDiv) {
        this.pending = null;
        return;
      }
      const layout = activeDiv.layout || activeDiv._fullLayout || {};
      const xRange = (layout.xaxis && Array.isArray(layout.xaxis.range)) ? [layout.xaxis.range[0], layout.xaxis.range[1]] : null;
      const yRanges = {};
      Object.keys(layout).forEach(key => {
        if (key.startsWith('yaxis') && layout[key] && Array.isArray(layout[key].range)) {
          yRanges[key] = [layout[key].range[0], layout[key].range[1]];
        }
      });
      this.pending = { xRange, yRanges };
    } catch (e) {
      console.warn('ViewportPreserver.capture failed', e);
      this.pending = null;
    }
  },
  hasPending() {
    return !!(this.pending && this.pending.xRange);
  },
  wasJustApplied(windowMs = 1000) {
    return Date.now() - this.lastAppliedAt < windowMs;
  },
  applyIfPending() {
    const saved = this.pending;
    if (!saved || !saved.xRange) { this.pending = null; return; }
    try {
      const activeDiv = this.getActivePlotDiv();
      if (!activeDiv) { this.pending = null; return; }
      const ds = activeDiv.getAttribute('data-start-time');
      const de = activeDiv.getAttribute('data-end-time');
      if (!ds || !de) { this.pending = null; return; }
      const domainStart = new Date(ds);
      const domainEnd = new Date(de);
      const oldStart = new Date(saved.xRange[0]);
      const oldEnd = new Date(saved.xRange[1]);
      if (isNaN(oldStart) || isNaN(oldEnd) || isNaN(domainStart) || isNaN(domainEnd)) { this.pending = null; return; }
      const width = oldEnd - oldStart;
      const domainWidth = domainEnd - domainStart;
      let newStart = oldStart;
      let newEnd = oldEnd;
      if (width >= domainWidth || width <= 0) {
        newStart = domainStart;
        newEnd = domainEnd;
      } else {
        if (oldStart < domainStart) {
          newStart = domainStart;
          newEnd = new Date(newStart.getTime() + width);
          if (newEnd > domainEnd) { newStart = new Date(domainEnd.getTime() - width); newEnd = domainEnd; }
        } else if (oldEnd > domainEnd) {
          newEnd = domainEnd;
          newStart = new Date(newEnd.getTime() - width);
          if (newStart < domainStart) { newStart = domainStart; newEnd = new Date(domainStart.getTime() + width); }
        }
      }
      const fmt = d => d.toISOString().replace('Z','');
      const update = { 'xaxis.range': [fmt(newStart), fmt(newEnd)] };
      if (saved.yRanges) {
        Object.keys(saved.yRanges).forEach(axisKey => {
          const yr = saved.yRanges[axisKey];
          if (Array.isArray(yr) && yr.length === 2) {
            update[`${axisKey}.range`] = [yr[0], yr[1]];
          }
        });
      }
      Plotly.relayout(activeDiv.id, update);
      this.lastAppliedAt = Date.now();
    } catch (e) {
      console.warn('ViewportPreserver.applyIfPending failed', e);
    } finally {
      this.pending = null;
    }
  }
};

// Handle browser back/forward navigation for complete state restoration
window.addEventListener('popstate', function(event) {
  console.log('Popstate event:', event.state);
  
  if (event.state) {
    // Restore location
    if (event.state.location) {
      const locationData = event.state.location;
      if (window.LocationSearch) {
        window.LocationSearch.addLocationToDropdown(locationData);
      }
    }
    
    // Restore model selection
    if (event.state.model) {
      const modelSelect = document.getElementById('modelSelect');
      if (modelSelect && models.find(m => m.id === event.state.model)) {
        modelSelect.value = event.state.model;
      }
    }
    
    // Restore panel selection
    if (event.state.panel) {
      const panelSelect = document.getElementById('panelSelect');
      if (panelSelect) {
        panelSelect.value = event.state.panel;
      }
    }
    
    // Restore view if specified
    if (event.state.view) {
      // Handle view restoration after plot is ready
      setTimeout(() => {
        restoreViewFromUrl(event.state.view);
      }, 500);
    }
    
    window.fetchAndPlot();
  } else {
    // No state, parse from URL
    const urlParams = getUrlParams();
    if (urlParams.location || urlParams.model || urlParams.panel) {
      window.location.reload();
    }
  }
});

// Function to restore view from URL parameter
function restoreViewFromUrl(view) {
  const viewButtons = {
    '1d': 'view1d',
    '2d': 'view2d', 
    '5d': 'view5d',
    'all': 'viewAll'
  };
  
  const buttonId = viewButtons[view];
  if (buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.click();
      console.log('Restored view from URL:', view);
    }
  }
}



// Initialize the plot with default selections after API is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure API is loaded
  setTimeout(() => {
    window.fetchAndPlot();
    
    // Restore view from URL if specified
    if (urlParams.view) {
      setTimeout(() => {
        restoreViewFromUrl(urlParams.view);
      }, 1000); // Wait for plot to be ready
    }
    
    // Re-plot when location, model, or panel changes
    document.getElementById("locationSelect").addEventListener("change", function(event) {
      const selectedValue = event.target.value;
      const specialOptions = ['MAP_PICKER', 'SEARCH_LOCATION', 'CURRENT_LOCATION'];
      
      // If a regular location is selected, update the URL to keep everything in sync
      if (selectedValue && !specialOptions.includes(selectedValue)) {
        try {
          const locationData = JSON.parse(selectedValue);
          if (locationData.lat && locationData.lon && locationData.name) {
            // Get current app state and update URL with new location
            const modelSelect = document.getElementById('modelSelect');
            const panelSelect = document.getElementById('panelSelect');
            
            updateUrlWithAppState(
              locationData, // Use the new location directly
              modelSelect ? modelSelect.value : null,
              panelSelect ? panelSelect.value : null,
              null // view will be determined by view buttons
            );
            console.log("Updated URL for location change:", locationData.name);
          }
        } catch (e) {
          console.log("Could not parse location data for URL update", e);
        }
      }
      
      // Always fetch and plot the weather data
      window.fetchAndPlot();
    });
    document.getElementById("modelSelect").addEventListener("change", function(event) {
      if (window.ViewportPreserver && typeof window.ViewportPreserver.capture === 'function') {
        window.ViewportPreserver.capture();
      }
      
      // Update URL with new model selection
      const currentState = getCurrentAppState();
      updateUrlWithAppState(
        currentState.location, 
        event.target.value, // Use the new model directly
        currentState.panel, 
        currentState.view
      );
      console.log("Updated URL for model change:", event.target.value);
      
      window.fetchAndPlot();
    });
    
    document.getElementById("panelSelect").addEventListener("change", function(event) {
      updateModelRowVisibility();
      if (window.ViewportPreserver) window.ViewportPreserver.capture();
      const currentState = getCurrentAppState();
      updateUrlWithAppState(
        currentState.location,
        currentState.model,
        event.target.value,
        currentState.view
      );
      window.fetchAndPlot();
    });

    document.getElementById('dewPointToggle').addEventListener('change', function() {
      if (window.WeatherPlot) window.WeatherPlot._showDewPoint = this.checked;
      const plotDiv = document.getElementById('plot');
      if (plotDiv && plotDiv.classList.contains('js-plotly-plot')) {
        Plotly.restyle('plot', { visible: this.checked }, [1]);
        Plotly.relayout('plot', { 'yaxis2.visible': this.checked });
      }
    });

  }, 100);
});

// Exact x-axis range saved by every function that changes the view.
// null = show full data range.
window._savedXRange = null;

window.applyActiveView = function() {
  const saved = window._savedXRange;
  const cc = document.getElementById('compare-chart');
  const pd = document.getElementById('plot');
  const el = (cc && cc.classList.contains('js-plotly-plot')) ? cc
           : (pd && pd.classList.contains('js-plotly-plot')) ? pd
           : null;
  if (!el) return;
  const ds = el.getAttribute('data-start-time');
  const de = el.getAttribute('data-end-time');
  if (!ds || !de) return;

  if (!saved) { Plotly.relayout(el.id, { 'xaxis.range': [ds, de] }); return; }

  const domS = new Date(ds), domE = new Date(de);
  let ns = new Date(saved.start), ne = new Date(saved.end);
  const w = ne - ns, domW = domE - domS;
  if (w <= 0 || w >= domW) { Plotly.relayout(el.id, { 'xaxis.range': [ds, de] }); return; }
  if (ns < domS) { ns = domS; ne = new Date(ns.getTime() + w); }
  if (ne > domE) { ne = domE; ns = new Date(ne.getTime() - w); }
  if (ns < domS) ns = domS;
  const fmt = d => d.toISOString().replace('Z', '');
  Plotly.relayout(el.id, { 'xaxis.range': [fmt(ns), fmt(ne)] });
};

// Add View Range Button Event Handlers with URL updates
document.getElementById("view1d").addEventListener("click", function() {
  if (document.getElementById('panelSelect').value === 'compare' && window.ComparePanel) {
    window.ComparePanel.viewOneDay();
  } else if (window.WeatherPlot && typeof window.WeatherPlot.viewOneDay === 'function') {
    window.WeatherPlot.viewOneDay();
  }
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, '1d');
});

document.getElementById("view2d").addEventListener("click", function() {
  if (document.getElementById('panelSelect').value === 'compare' && window.ComparePanel) {
    window.ComparePanel.relayoutView(2);
  } else {
    window.WeatherPlot.adjustViewRange(2);
  }
  // Update URL with view parameter
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, '2d');
});

document.getElementById("view5d").addEventListener("click", function() {
  if (document.getElementById('panelSelect').value === 'compare' && window.ComparePanel) {
    window.ComparePanel.relayoutView(5);
  } else {
    window.WeatherPlot.adjustViewRange(5);
  }
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, '5d');
});

document.getElementById("viewAll").addEventListener("click", function() {
  window._savedXRange = null;
  if (document.getElementById('panelSelect').value === 'compare' && window.ComparePanel) {
    window.ComparePanel.viewAll();
  } else {
    const plotDiv = document.getElementById('plot');
    // Only attempt to relayout if a Plotly chart is active
    if (plotDiv && plotDiv.classList && plotDiv.classList.contains('js-plotly-plot')) {
      const startTime = plotDiv.getAttribute('data-start-time');
      const endTime = plotDiv.getAttribute('data-end-time');
      Plotly.relayout('plot', {
        'xaxis.range': [startTime, endTime]
      });
    }
  }
  // Update URL with view parameter
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, 'all');
});

// Add Navigation Button Event Handlers
document.getElementById("navLeft").addEventListener("click", function() {
  if (document.getElementById('panelSelect').value === 'compare' && window.ComparePanel) {
    window.ComparePanel.navigateTime('left');
  } else if (window.SwipeNavigation && typeof window.SwipeNavigation.handleSwipe === 'function') {
    window.SwipeNavigation.handleSwipe('left');
  }
});

document.getElementById("navRight").addEventListener("click", function() {
  if (document.getElementById('panelSelect').value === 'compare' && window.ComparePanel) {
    window.ComparePanel.navigateTime('right');
  } else if (window.SwipeNavigation && typeof window.SwipeNavigation.handleSwipe === 'function') {
    window.SwipeNavigation.handleSwipe('right');
  }
});

// Set active style for view buttons
const viewBtns = document.querySelectorAll('.view-btn');
viewBtns.forEach(btn => {
  btn.addEventListener('click', function() {
    viewBtns.forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
});

// Mobile-specific improvements
// Handle UI adjustments, orientation changes, resize, and controls visibility toggling
document.addEventListener('DOMContentLoaded', function() {
  const controls = document.getElementById('controls');
  const plot = document.getElementById('plot');
  const fadeButton = document.getElementById('fade-button');
  let isControlsVisible = true;

  // Measure the height of the controls panel and adjust plot margins dynamically
  function adjustPlotMargin() {
    if (!controls || !plot) return;
    if (isControlsVisible) {
      const h = controls.offsetHeight;
      plot.style.marginTop = h + 'px';
      plot.style.height = `calc(100dvh - ${h}px)`;
    } else {
      plot.style.marginTop = '0px';
      plot.style.height = '100dvh';
    }
  }

  // Set up ResizeObserver to dynamically adjust margins whenever controls size changes
  const resizeObserver = new ResizeObserver(() => {
    adjustPlotMargin();
  });
  if (controls) {
    resizeObserver.observe(controls);
  }

  // Handle mobile orientation changes
  window.addEventListener('orientationchange', function() {
    setTimeout(() => {
      adjustPlotMargin();
      if (window.WeatherPlot && window.WeatherPlot.renderWeatherData) {
        const event = new Event('resize');
        window.dispatchEvent(event);
      }
    }, 500);
  });

  // Handle window resize for mobile and comparison chart sizing
  window.addEventListener('resize', function() {
    adjustPlotMargin();
    const compareChart = document.getElementById('compare-chart');
    if (compareChart && compareChart.classList && compareChart.classList.contains('js-plotly-plot')) {
      const n = (window.ComparePanel && window.ComparePanel.selectedParams) ? window.ComparePanel.selectedParams.length : 5;
      Plotly.relayout('compare-chart', {
        width: window.innerWidth,
        height: Math.max(window.innerHeight - 150, 120 + n * 130)
      });
    } else {
      const plotDiv = document.getElementById('plot');
      if (plotDiv && plotDiv.classList && plotDiv.classList.contains('js-plotly-plot')) {
        // Update plot dimensions only when a Plotly chart is present
        Plotly.relayout('plot', {
          width: window.innerWidth,
          height: Math.max(window.innerHeight - 120, 400)
        });
      }
    }
  });

  function showControls() {
    if (controls) {
      controls.classList.remove('fade-out');
      controls.classList.add('fade-in');
    }
    if (plot) {
      plot.classList.add('with-controls');
    }
    isControlsVisible = true;
    adjustPlotMargin();
    if (fadeButton) {
      fadeButton.textContent = '👁️';
      fadeButton.title = 'Hide Controls';
      fadeButton.setAttribute('aria-label', 'Hide Controls');
    }
  }

  function hideControls() {
    if (controls) {
      controls.classList.remove('fade-in');
      controls.classList.add('fade-out');
    }
    if (plot) {
      plot.classList.remove('with-controls');
    }
    isControlsVisible = false;
    adjustPlotMargin();
    if (fadeButton) {
      fadeButton.textContent = '👁️‍🗨️';
      fadeButton.title = 'Show Controls';
      fadeButton.setAttribute('aria-label', 'Show Controls');
    }
  }

  // Initialize visible state
  showControls();

  if (fadeButton) {
    // Touch: prevent synthetic click and bubbling
    fadeButton.addEventListener('touchstart', function(event) {
      event.stopPropagation();
      event.preventDefault();
      if (isControlsVisible) {
        hideControls();
      } else {
        showControls();
      }
    }, { passive: false });

    // Click: desktop and fallback
    fadeButton.addEventListener('click', function(event) {
      event.stopPropagation();
      if (isControlsVisible) {
        hideControls();
      } else {
        showControls();
      }
    });
  }

  // Keyboard navigation shortcuts (Escape, ArrowUp, ArrowDown)
  document.addEventListener('keydown', function(event) {
    // Avoid interfering with input elements, selects, or textareas
    if (['input', 'select', 'textarea'].includes(event.target.tagName.toLowerCase())) {
      return;
    }

    // 1. Escape key: Toggle controls visibility (acting as a shortcut for the eye button)
    if (event.key === 'Escape') {
      event.preventDefault();
      const help = document.getElementById('help-overlay');
      if (help) { help.remove(); return; }
      if (isControlsVisible) { hideControls(); } else { showControls(); }
    }

    // 2. ArrowUp / ArrowDown keys: Switch between metric panels
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const panelSelect = document.getElementById('panelSelect');
      if (!panelSelect) return;

      const options = Array.from(panelSelect.options);
      let currentIndex = panelSelect.selectedIndex;

      if (event.key === 'ArrowDown') {
        currentIndex = (currentIndex + 1) % options.length;
      } else {
        currentIndex = (currentIndex - 1 + options.length) % options.length;
      }

      panelSelect.selectedIndex = currentIndex;
      panelSelect.dispatchEvent(new Event('change'));
      showControls();
    }

    // 3. View range: 1, 2, 5, a
    if (event.key === '1') { event.preventDefault(); document.getElementById('view1d')?.click(); }
    if (event.key === '2') { event.preventDefault(); document.getElementById('view2d')?.click(); }
    if (event.key === '5') { event.preventDefault(); document.getElementById('view5d')?.click(); }
    if (event.key === 'a') { event.preventDefault(); document.getElementById('viewAll')?.click(); }

    // 4. Panel shortcuts: t, u, c, o, r
    const panelKeys = { t: 'temperature', u: 'uv_wind', w: 'uv_wind', c: 'compare', o: 'overview' };
    if (panelKeys[event.key]) {
      event.preventDefault();
      const sel = document.getElementById('panelSelect');
      if (sel) { sel.value = panelKeys[event.key]; sel.dispatchEvent(new Event('change')); }
    }

    // 5. r — open Radar in new tab
    if (event.key === 'r') {
      event.preventDefault();
      const p = new URLSearchParams(window.location.search);
      window.open('./radar.html?lat=' + (p.get('lat') || '47.6952') + '&lon=' + (p.get('lon') || '9.1307'), '_blank');
    }

    // 6. ? — toggle keyboard help overlay
    if (event.key === '?') {
      event.preventDefault();
      toggleHelpOverlay();
    }
  });
});
