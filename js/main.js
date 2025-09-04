let measured_temp = null;
let measured_water_temp = null;

// ------------------------------
// 1) Configuration and Panel System
// ------------------------------

// Import configuration (using global objects for file:// compatibility)
// Note: In a real ES module setup, this would be:
// import { PANELS, PANEL_CONFIG, WEATHER_MODELS, LOCATIONS, DEFAULT_SETTINGS } from './config/appConfig.js';

// For now, we'll define the configuration inline to maintain file:// compatibility
const PANELS = ['temperature', 'uv_wind', 'actuals'];
const PANEL_CONFIG = {
  temperature: {
    enabled: true,
    title: 'Temperature',
    description: 'Temperature forecast with ensemble data',
    defaultView: '2d',
    showEnsemble: true,
    showCurrent: true
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
const models = [
  { id: "bestmatch", label: "🇩🇪 Best Match", model: "best_match", type: "deterministic" },
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

// Populate Model Dropdown
models.forEach(m => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.label;
  modSelect.appendChild(opt);
});

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
  const validPanels = ['temperature', 'uv_wind', 'actuals'];
  if (validPanels.includes(urlParams.panel)) {
    panelSelect.value = urlParams.panel;
    console.log("Set panel from URL:", urlParams.panel);
  }
}

// ------------------------------
// 3) Fetch & Plot Function
// ------------------------------
// Make fetchAndPlot globally accessible for location search integration
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
  
  try {
    const data = await window.WeatherAPI.getWeatherDataWithFallback(selectedLoc, selectedModel);
    
    // Get the selected panel from the dropdown
    const panelSelect = document.getElementById('panelSelect');
    const selectedPanel = panelSelect ? panelSelect.value : 'temperature';
    
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
    // Error status removed to save space - check console for errors
  }
};

// ------------------------------
// 4) Process Data & Plot (Using Plotly.js)
// ------------------------------
async function processWeatherData(data, selectedLoc, model, selectedPanel = 'temperature') {
  // Use the plot module to render the weather data
  await window.WeatherPlot.renderWeatherData(data, selectedLoc, model, selectedPanel);
} // End of processWeatherData

// ------------------------------
// Viewport Preserver (Feature 3)
// ------------------------------
window.ViewportPreserver = {
  pending: null,
  lastAppliedAt: 0,
  capture() {
    try {
      const plotDiv = document.getElementById('plot');
      if (!plotDiv || !plotDiv.classList || !plotDiv.classList.contains('js-plotly-plot')) {
        this.pending = null;
        return;
      }
      const layout = plotDiv.layout || plotDiv._fullLayout || {};
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
      const plotDiv = document.getElementById('plot');
      if (!plotDiv) { this.pending = null; return; }
      const ds = plotDiv.getAttribute('data-start-time');
      const de = plotDiv.getAttribute('data-end-time');
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
      Plotly.relayout('plot', update);
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
      // Update URL with new panel selection
      const currentState = getCurrentAppState();
      updateUrlWithAppState(
        currentState.location, 
        currentState.model, 
        event.target.value, // Use the new panel directly
        currentState.view
      );
      console.log("Updated URL for panel change:", event.target.value);
      
      window.fetchAndPlot();
    });
  }, 100);
});

// Add View Range Button Event Handlers with URL updates
document.getElementById("view1d").addEventListener("click", function() {
  if (window.WeatherPlot && typeof window.WeatherPlot.viewOneDay === 'function') {
    window.WeatherPlot.viewOneDay();
  }
  // Update URL with view parameter
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, '1d');
});

document.getElementById("view2d").addEventListener("click", function() {
  window.WeatherPlot.adjustViewRange(2);
  // Update URL with view parameter
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, '2d');
});

document.getElementById("view5d").addEventListener("click", function() {
  window.WeatherPlot.adjustViewRange(5);
  // Update URL with view parameter
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, '5d');
});

document.getElementById("viewAll").addEventListener("click", function() {
  const plotDiv = document.getElementById('plot');
  // Only attempt to relayout if a Plotly chart is active
  if (plotDiv && plotDiv.classList && plotDiv.classList.contains('js-plotly-plot')) {
    const startTime = plotDiv.getAttribute('data-start-time');
    const endTime = plotDiv.getAttribute('data-end-time');
    Plotly.relayout('plot', {
      'xaxis.range': [startTime, endTime]
    });
  }
  // Update URL with view parameter
  const currentState = getCurrentAppState();
  updateUrlWithAppState(currentState.location, currentState.model, currentState.panel, 'all');
});

// Add Navigation Button Event Handlers
document.getElementById("navLeft").addEventListener("click", function() {
  if (window.SwipeNavigation && typeof window.SwipeNavigation.handleSwipe === 'function') {
    window.SwipeNavigation.handleSwipe('left');
  }
});

document.getElementById("navRight").addEventListener("click", function() {
  if (window.SwipeNavigation && typeof window.SwipeNavigation.handleSwipe === 'function') {
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
document.addEventListener('DOMContentLoaded', function() {
  // Handle mobile orientation changes
  window.addEventListener('orientationchange', function() {
    setTimeout(() => {
      // Re-render the plot with new dimensions
      if (window.WeatherPlot && window.WeatherPlot.renderWeatherData) {
        // Trigger a re-plot with current data
        const event = new Event('resize');
        window.dispatchEvent(event);
      }
    }, 500);
  });

  // Handle window resize for mobile
  window.addEventListener('resize', function() {
    const plotDiv = document.getElementById('plot');
    if (plotDiv && plotDiv.classList && plotDiv.classList.contains('js-plotly-plot')) {
      // Update plot dimensions only when a Plotly chart is present
      Plotly.relayout('plot', {
        width: window.innerWidth,
        height: Math.max(window.innerHeight - 120, 400)
      });
    }
  });
});

// Manual-only controls visibility toggle
document.addEventListener('DOMContentLoaded', function() {
  const controls = document.getElementById('controls');
  const plot = document.getElementById('plot');
  const fadeButton = document.getElementById('fade-button');
  let isControlsVisible = true;

  function showControls() {
    controls.classList.remove('fade-out');
    controls.classList.add('fade-in');
    plot.classList.add('with-controls');
    isControlsVisible = true;
    if (fadeButton) {
      fadeButton.textContent = '👁️';
      fadeButton.title = 'Hide Controls';
      fadeButton.setAttribute('aria-label', 'Hide Controls');
    }
  }

  function hideControls() {
    controls.classList.remove('fade-in');
    controls.classList.add('fade-out');
    plot.classList.remove('with-controls');
    isControlsVisible = false;
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
});
