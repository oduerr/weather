let measured_temp = null;
let measured_water_temp = null;

// ------------------------------
// 1) Configuration and Panel System
// ------------------------------

// Import configuration (using global objects for file:// compatibility)
// Note: In a real ES module setup, this would be:
// import { PANELS, PANEL_CONFIG, WEATHER_MODELS, LOCATIONS, DEFAULT_SETTINGS } from './config/appConfig.js';

// For now, we'll define the configuration inline to maintain file:// compatibility
const PANELS = ['temperature', 'uv_wind'];
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
  }
};

// Available locations and models (keeping existing structure for compatibility)
const locations = [
  { name: "🇩🇪 Konstanz", lat: 47.6952, lon: 9.1307 },
  { name: "🇨🇭 🏔️ Chäserrugg", lat: 47.1549, lon: 9.3128 },
  { name: "🇨🇭 🏔️ Wildhaus", lat: 47.2033, lon: 9.3505 },
  { name: "🇨🇭 Zurich", lat: 47.3769, lon: 8.5417 },
  { name: "🇫🇮 Espoo", lat:60.205490, lon: 24.655899},
  { name: "🌲🌲 Fischbach", lat: 48.157652, lon: 8.487578 },
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
    
    statusElement.textContent = `Data updated at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error("Error fetching data:", err);
    statusElement.textContent = "Error fetching data";
  }
}

// ------------------------------
// 4) Process Data & Plot (Using Plotly.js)
// ------------------------------
async function processWeatherData(data, selectedLoc, model, selectedPanel = 'temperature') {
  // Use the plot module to render the weather data
  await window.WeatherPlot.renderWeatherData(data, selectedLoc, model, selectedPanel);
} // End of processWeatherData

// Initialize the plot with default selections after API is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure API is loaded
  setTimeout(() => {
    fetchAndPlot();
    
    // Re-plot when location, model, or panel changes
    document.getElementById("locationSelect").addEventListener("change", fetchAndPlot);
    document.getElementById("modelSelect").addEventListener("change", fetchAndPlot);
    document.getElementById("panelSelect").addEventListener("change", fetchAndPlot);
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
    if (window.WeatherPlot && window.WeatherPlot.renderWeatherData) {
      // Update plot dimensions
      Plotly.relayout('plot', {
        width: window.innerWidth,
        height: Math.max(window.innerHeight - 120, 400)
      });
    }
  });
});

// Mobile fade controls functionality
document.addEventListener('DOMContentLoaded', function() {
  const controls = document.getElementById('controls');
  const plot = document.getElementById('plot');
  const fadeTrigger = document.getElementById('fade-trigger');
  const fadeButton = document.getElementById('fade-button');
  let fadeTimeout;
  let isControlsVisible = true;
  let lastInteractionTime = Date.now();

  // Function to show controls
  function showControls() {
    if (!isControlsVisible) {
      controls.classList.remove('fade-out');
      controls.classList.add('fade-in');
      plot.classList.add('with-controls');
      isControlsVisible = true;
      // Keep toggle button in sync
      if (fadeButton) {
        fadeButton.textContent = '👁️';
        fadeButton.title = 'Hide Controls';
      }
    }
    lastInteractionTime = Date.now();
    clearTimeout(fadeTimeout);
  }

  // Function to hide controls
  function hideControls() {
    if (isControlsVisible) {
      controls.classList.remove('fade-in');
      controls.classList.add('fade-out');
      plot.classList.remove('with-controls');
      isControlsVisible = false;
      // Keep toggle button in sync
      if (fadeButton) {
        fadeButton.textContent = '👁️‍🗨️';
        fadeButton.title = 'Show Controls';
      }
    }
  }

  // Function to schedule hiding with proper timing
  function scheduleHide() {
    clearTimeout(fadeTimeout);
    const timeSinceLastInteraction = Date.now() - lastInteractionTime;
    const remainingDelay = Math.max(3000 - timeSinceLastInteraction, 1000);
    
    fadeTimeout = setTimeout(() => {
      // Only hide if no recent interactions
      if (Date.now() - lastInteractionTime >= 3000) {
        hideControls();
      }
    }, remainingDelay);
  }

  // Show controls on hover/touch of trigger area
  fadeTrigger.addEventListener('mouseenter', showControls);
  fadeTrigger.addEventListener('touchstart', showControls, { passive: true });

  // Show controls when interacting with controls
  controls.addEventListener('mouseenter', showControls);
  controls.addEventListener('touchstart', showControls, { passive: true });

  // Schedule hide on mouse/touch leave
  fadeTrigger.addEventListener('mouseleave', scheduleHide);
  controls.addEventListener('mouseleave', scheduleHide);

  // Show controls on any interaction with the page, then schedule hide for mobile taps
  document.addEventListener('click', function() {
    showControls();
    scheduleHide();
  });
  document.addEventListener('touchstart', function() {
    showControls();
    scheduleHide();
  }, { passive: true });

  // Show controls on scroll (mobile) with debouncing
  let scrollTimeout;
  let lastScrollTop = 0;
  window.addEventListener('scroll', function() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (Math.abs(scrollTop - lastScrollTop) > 10) {
      showControls();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(scheduleHide, 1000);
    }
    lastScrollTop = scrollTop;
  });

  // Auto-hide controls after initial load
  setTimeout(() => {
    if (isControlsVisible) {
      hideControls();
    }
  }, 5000);

  // Ensure controls are visible when page becomes visible
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      showControls();
      scheduleHide();
    }
  });

  // Handle window focus events
  window.addEventListener('focus', function() {
    showControls();
    scheduleHide();
  });

  // Debug function to check fade state (can be removed in production)
  window.debugFadeState = function() {
    console.log('Controls visible:', isControlsVisible);
    console.log('Fade classes:', controls.className);
    console.log('Time since last interaction:', Date.now() - lastInteractionTime);
  };

  // Test function to manually trigger fade (for debugging)
  window.testFade = function() {
    console.log('Testing fade controls...');
    showControls();
    setTimeout(() => {
      console.log('Hiding controls in 2 seconds...');
      hideControls();
    }, 2000);
  };

  // Test function for fade button
  window.testFadeButton = function() {
    const fadeButtonEl = document.getElementById('fade-button');
    if (fadeButtonEl) {
      console.log('Testing fade button...');
      fadeButtonEl.click();
    } else {
      console.log('Fade button not found');
    }
  };

  // Fade button functionality
  if (fadeButton) {
    // Handle taps on mobile to avoid document-level touchstart toggling back
    fadeButton.addEventListener('touchstart', function(event) {
      // Ensure this does not bubble to document touchstart
      event.stopPropagation();
      // Prevent the subsequent synthetic click
      event.preventDefault();

      if (isControlsVisible) {
        hideControls();
      } else {
        showControls();
        scheduleHide();
      }
    }, { passive: false });

    // Handle clicks (desktop and fallback)
    fadeButton.addEventListener('click', function(event) {
      // Prevent this click from triggering the page-wide show controls
      event.stopPropagation();
      
      console.log('Fade button clicked, current state:', isControlsVisible);
      
      if (isControlsVisible) {
        hideControls();
      } else {
        showControls();
        // After showing via button, auto-hide after delay
        scheduleHide();
      }
    });
    
    console.log('✅ Fade button event listeners attached');
  } else {
    console.log('⚠️ Fade button not found');
  }

  // Log initial state
  console.log('Fade controls initialized. Use debugFadeState() to check state.');
});
