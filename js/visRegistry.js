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
