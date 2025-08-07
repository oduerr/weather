/**
 * API module for weather data fetching
 * Handles Open-Meteo API calls, caching, and fallback data
 */

// Create global API object
window.WeatherAPI = {};

// Cache configuration
const CACHE_KEY = "weatherDataCache";
const CACHE_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch current weather data from Konstanz University
 * @param {Function} callback - Callback function with (airTemp, waterTemp) parameters
 */
window.WeatherAPI.fetchKonstanzWeather = function(callback) {
  fetch("https://www.uni-konstanz.de/hsp/wetter/data/current.json")
      .then(response => response.json())
      .then(data => {
          const airTemp = data.temperature?.value || "N/A";
          const waterTemp = data.temperature_water?.value || "N/A";
          callback(airTemp, waterTemp);
      })
      .catch(error => {
          console.error("Error fetching Konstanz weather:", error);
          callback("N/A", "N/A");  // Fallback values
      });
}

/**
 * Get weather data from Open-Meteo API with caching
 * @param {Object} location - Location object with lat, lon, name
 * @param {Object} model - Model object with id, type, model properties
 * @returns {Promise<Object>} Weather data object
 */
window.WeatherAPI.getWeatherData = async function(location, model) {
  // Check cache first
  const cacheKey = `${location.lat},${location.lon},${model.id}`;
  const cachedData = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  
  if (cachedData[cacheKey]) {
    const cachedEntry = cachedData[cacheKey];
    
    // Check if cache is still valid
    if (Date.now() - cachedEntry.timestamp < CACHE_EXPIRATION_MS) {
      console.log("✅ Using cached data for", location.name);
      return cachedEntry.data;
    }
  }

  // If no valid cache, fetch new data
  console.log("Fetching fresh data for", location.name);
  
  // Determine API endpoint and variables based on model type
  let hourlyVars, apiUrl;
  if (model.type === "ensemble") {
    hourlyVars = [
      "temperature_2m", "relative_humidity_2m",
      "precipitation", "cloud_cover", "weather_code",
      "uv_index", "uv_index_clear_sky", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
    ];
    apiUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?`;
  } else {
    hourlyVars = [
      "temperature_2m", "relative_humidity_2m", "dew_point_2m",
      "precipitation", "precipitation_probability", "weather_code",
      "cloud_cover", "cloud_cover_low", "cloud_cover_mid",
      "cloud_cover_high", "visibility", "sunshine_duration",
      "uv_index", "uv_index_clear_sky", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
    ];
    apiUrl = `https://api.open-meteo.com/v1/forecast?`;
  }

  const dailyVars = ["sunrise", "sunset"];

  // Build API URL
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    hourly: hourlyVars.join(","),
    "timezone": "Europe/Berlin",
    models: model.model,
  });
  
  // Only add daily parameters for deterministic models
  if (model.type !== "ensemble") {
    params.append("daily", dailyVars.join(","));
  }

  try {
    const response = await fetch(apiUrl + params.toString());
    const data = await response.json();
    
    // Store new data in cache
    cachedData[cacheKey] = {
      data: data,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
    
    return data;
  } catch (error) {
    console.error("Error fetching weather data:", error);
    throw error;
  }
}

/**
 * Load fixture data for local testing
 * @returns {Promise<Object>} Sample weather data
 */
window.WeatherAPI.loadFixtureData = async function() {
  try {
    const response = await fetch('./fixtures/sample.json');
    const data = await response.json();
    console.log("✅ Loaded fixture data");
    return data;
  } catch (error) {
    console.error("Error loading fixture data:", error);
    throw error;
  }
}

/**
 * Get weather data with fallback to fixture data
 * @param {Object} location - Location object
 * @param {Object} model - Model object
 * @param {boolean} useFixture - Whether to use fixture data instead of live API
 * @returns {Promise<Object>} Weather data object
 */
window.WeatherAPI.getWeatherDataWithFallback = async function(location, model, useFixture = false) {
  if (useFixture) {
    return await window.WeatherAPI.loadFixtureData();
  }
  
  try {
    return await window.WeatherAPI.getWeatherData(location, model);
  } catch (error) {
    console.warn("Failed to fetch live data, trying fixture data...");
    try {
      return await window.WeatherAPI.loadFixtureData();
    } catch (fixtureError) {
      console.error("Both live and fixture data failed:", fixtureError);
      throw error;
    }
  }
}
