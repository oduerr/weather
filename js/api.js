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
 * Fetch weather station data from Konstanz weather station
 * @param {string} startTime - Start time in ISO format
 * @param {string} endTime - End time in ISO format
 * @returns {Promise<Array>} Array of weather station measurements
 */
window.WeatherAPI.fetchWeatherStationData = async function(startTime, endTime) {
  const baseUrl = "https://fogcast.in.htwg-konstanz.de/api/";
  const url = baseUrl + "weatherstation";
  
  const params = new URLSearchParams({
    "start": startTime,
    "stop": endTime
  });

  try {
    // Try with CORS mode
    const response = await fetch(url + "?" + params.toString(), {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`Weather station API returned ${response.status}, trying without CORS...`);
      
      // Try without CORS as fallback
      const response2 = await fetch(url + "?" + params.toString());
      if (!response2.ok) {
        throw new Error(`HTTP error! status: ${response2.status}`);
      }
      const data = await response2.json();
      console.log("✅ Fetched weather station data:", data.length, "measurements");
      return data;
    }
    
    const data = await response.json();
    console.log("✅ Fetched weather station data:", data.length, "measurements");
    return data;
  } catch (error) {
    console.error("Error fetching weather station data:", error);
    console.log("⚠️ Weather station API might not be accessible from browser due to CORS");
    return [];
  }
}

/**
 * Process weather station data for chart integration
 * @param {Array} stationData - Raw weather station data
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Object} Processed data with temperature and water temperature
 */
window.WeatherAPI.processWeatherStationData = function(stationData, currentDate) {
  if (!stationData || stationData.length === 0) {
    return { temperature: [], waterTemperature: [], times: [] };
  }

  // Filter data for current day only
  const todayData = stationData.filter(measurement => {
    const measurementDate = new Date(measurement.time).toISOString().split('T')[0];
    return measurementDate === currentDate;
  });

  if (todayData.length === 0) {
    return { temperature: [], waterTemperature: [], times: [] };
  }

  // Group data by hour and average measurements (~4 per hour)
  const hourlyGroups = {};
  
  todayData.forEach(measurement => {
    const time = new Date(measurement.time);
    const hour = time.getHours();
    const hourKey = `${currentDate}T${hour.toString().padStart(2, '0')}:00:00`;
    
    if (!hourlyGroups[hourKey]) {
      hourlyGroups[hourKey] = {
        temperatures: [],
        waterTemperatures: [],
        times: []
      };
    }
    
    hourlyGroups[hourKey].temperatures.push(measurement.temperature);
    hourlyGroups[hourKey].waterTemperatures.push(measurement.water_temperature);
    hourlyGroups[hourKey].times.push(measurement.time);
  });

  // Calculate averages for each hour
  const processedData = {
    temperature: [],
    waterTemperature: [],
    times: []
  };

  Object.keys(hourlyGroups).sort().forEach(hourKey => {
    const group = hourlyGroups[hourKey];
    
    // Calculate average temperature
    const avgTemp = group.temperatures.reduce((sum, temp) => sum + temp, 0) / group.temperatures.length;
    
    // Calculate average water temperature
    const avgWaterTemp = group.waterTemperatures.reduce((sum, temp) => sum + temp, 0) / group.waterTemperatures.length;
    
    processedData.temperature.push(avgTemp);
    processedData.waterTemperature.push(avgWaterTemp);
    processedData.times.push(hourKey);
  });

  console.log("✅ Processed weather station data:", processedData.times.length, "hourly averages");
  return processedData;
}

/**
 * Get weather station data for Konstanz
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Promise<Object>} Processed weather station data
 */
window.WeatherAPI.getKonstanzWeatherStationData = async function(currentDate) {
  // Use midnight from today as starting time
  const endTime = new Date();
  const startTime = new Date(currentDate + "T00:00:00Z"); // Midnight today
  
  // Format dates like the Python example
  const formatDate = (date) => {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };
  
  const rawData = await window.WeatherAPI.fetchWeatherStationData(formatDate(startTime), formatDate(endTime));
  
  // If API fails due to CORS, use mock data for demonstration
  if (rawData.length === 0) {
    console.log("🔄 Using mock weather station data due to CORS restrictions");
    return window.WeatherAPI.getMockWeatherStationData(currentDate);
  }
  
  return window.WeatherAPI.processWeatherStationData(rawData, currentDate);
}

/**
 * Generate mock weather station data for demonstration
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Object} Mock weather station data
 */
window.WeatherAPI.getMockWeatherStationData = function(currentDate) {
  const mockData = {
    temperature: [],
    waterTemperature: [],
    times: []
  };
  
  // Generate mock data for the current day (hourly averages)
  const now = new Date();
  const currentHour = now.getHours();
  
  for (let hour = 0; hour <= currentHour; hour++) {
    const time = `${currentDate}T${hour.toString().padStart(2, '0')}:00:00`;
    
    // Generate realistic temperature data (20-30°C range)
    const baseTemp = 25;
    const tempVariation = Math.sin(hour / 24 * 2 * Math.PI) * 5;
    const temp = baseTemp + tempVariation + (Math.random() - 0.5) * 2;
    
    // Generate water temperature (slightly cooler than air)
    const waterTemp = temp - 5 + (Math.random() - 0.5) * 1;
    
    mockData.temperature.push(Math.round(temp * 10) / 10);
    mockData.waterTemperature.push(Math.round(waterTemp * 10) / 10);
    mockData.times.push(time);
  }
  
  console.log("✅ Generated mock weather station data:", mockData.times.length, "measurements");
  return mockData;
}

/**
 * Fetch current weather data from BrightSky API for Konstanz
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Promise<Object>} Current weather observations
 */
window.WeatherAPI.fetchBrightSkyCurrentWeather = async function(currentDate) {
  const url = 'https://api.brightsky.dev/current_weather';
  const params = new URLSearchParams({
    lat: '47.6952',
    lon: '9.1307'
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("✅ Fetched BrightSky current weather:", data);
    return data;
  } catch (error) {
    console.error("Error fetching BrightSky weather data:", error);
    return null;
  }
}

/**
 * Fetch historical weather data from BrightSky API for Konstanz
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Promise<Object>} Historical weather observations
 */
window.WeatherAPI.fetchBrightSkyHistoricalWeather = async function(currentDate) {
  // BrightSky historical endpoint
  const url = 'https://api.brightsky.dev/weather';
  const params = new URLSearchParams({
    lat: '47.6952',
    lon: '9.1307',
    date: currentDate
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("✅ Fetched BrightSky historical weather:", data);
    return data;
  } catch (error) {
    console.error("Error fetching BrightSky historical weather data:", error);
    return null;
  }
}

/**
 * Process BrightSky historical data for chart integration
 * @param {Object} brightSkyData - Raw BrightSky historical API response
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Object} Processed observation data
 */
window.WeatherAPI.processBrightSkyHistoricalData = function(brightSkyData, currentDate) {
  if (!brightSkyData || !brightSkyData.weather || !Array.isArray(brightSkyData.weather)) {
    console.log("⚠️ No historical weather data available");
    return {
      temperature: [],
      humidity: [],
      precipitation: [],
      windSpeed: [],
      windDirection: [],
      windGustSpeed: [],
      windGustDirection: [],
      pressure: [],
      times: []
    };
  }

  const weatherObservations = brightSkyData.weather;
  
  // Compute "now" in Europe/Berlin
  const nowBerlinStr = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
  const nowBerlinIsoLike = nowBerlinStr.replace(" ", "T");
  const nowBerlinDate = new Date(nowBerlinIsoLike);
  const currentDateBerlin = nowBerlinIsoLike.split('T')[0];
  const currentHourBerlin = nowBerlinDate.getHours();
  
  // Create hourly data from actual historical observations
  const processedData = {
    temperature: [],
    humidity: [],
    precipitation: [],
    windSpeed: [],
    windDirection: [],
    windGustSpeed: [],
    windGustDirection: [],
    pressure: [],
    times: []
  };

  // Helper to (optionally) convert; currently disabled to avoid over-scaling
  const toKmh = (value) => {
    if (value == null || isNaN(value)) return 0;
    // Treat BrightSky historical wind as already km/h based on observed ~x3.6 inflation
    return value;
  };

  // Process each historical observation
  console.log("🔍 Processing", weatherObservations.length, "historical observations");
  weatherObservations.forEach((observation, index) => {
    const timestampUTC = new Date(observation.timestamp);
    // Convert to Europe/Berlin local time string and date
    const timeLocal = timestampUTC.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
    const obsDateBerlin = timeLocal.split('T')[0];
    const obsHourBerlin = new Date(timeLocal).getHours();
    
    // Only include observations from today (Berlin) up to current (Berlin) and not in the future
    if (obsDateBerlin === currentDateBerlin && obsHourBerlin <= currentHourBerlin && new Date(timeLocal) <= nowBerlinDate) {
      // Debug first few observations
      if (index < 3) {
        const windRaw = observation.wind_speed ?? observation.wind_speed_10;
        const gustRaw = observation.wind_gust ?? observation.wind_gust_speed_10 ?? observation.wind_gust_speed;
        console.log(`📊 Observation ${index + 1}:`, {
          timeUTC: timestampUTC.toISOString(),
          timeLocal,
          temp: observation.temperature,
          humidity: observation.relative_humidity,
          wind_raw: windRaw,
          wind_pass_through: toKmh(windRaw),
          gust_raw: gustRaw,
          gust_pass_through: toKmh(gustRaw),
          rawObservation: observation
        });
      }
      
      processedData.temperature.push(observation.temperature);
      processedData.humidity.push(observation.relative_humidity);
      processedData.precipitation.push(observation.precipitation_10 || 0);
      
      // Handle wind speed - check for different possible field names
      const windRaw = observation.wind_speed ?? observation.wind_speed_10 ?? 0;
      const gustRaw = observation.wind_gust ?? observation.wind_gust_speed_10 ?? observation.wind_gust_speed ?? 0;
      const windDir = observation.wind_direction ?? observation.wind_direction_10 ?? 0;
      const windGustDir = observation.wind_gust_direction ?? observation.wind_gust_direction_10 ?? 0;
      
      // Pass-through (assume km/h)
      processedData.windSpeed.push(toKmh(windRaw));
      processedData.windDirection.push(windDir);
      processedData.windGustSpeed.push(toKmh(gustRaw));
      processedData.windGustDirection.push(windGustDir);
      processedData.pressure.push(observation.pressure_msl);
      processedData.times.push(timeLocal);
    }
  });

  console.log("✅ Processed BrightSky historical data:", processedData.times.length, "actual observations");
  return processedData;
}

/**
 * Get BrightSky observation data for Konstanz
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Promise<Object>} Processed BrightSky observation data
 */
window.WeatherAPI.getBrightSkyObservationData = async function(currentDate) {
  // Use historical weather endpoint to get observed data for the entire day
  const brightSkyData = await window.WeatherAPI.fetchBrightSkyHistoricalWeather(currentDate);
  
  if (!brightSkyData) {
    console.log("⚠️ BrightSky API not available - no observed data will be shown");
    return {
      temperature: [],
      humidity: [],
      precipitation: [],
      windSpeed: [],
      windDirection: [],
      windGustSpeed: [],
      windGustDirection: [],
      pressure: [],
      times: []
    };
  }
  
  return window.WeatherAPI.processBrightSkyHistoricalData(brightSkyData, currentDate);
}



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
 * Get forecast data from Open-Meteo API with caching
 * @param {Object} location - Location object with lat, lon, name
 * @param {Object} model - Model object with id, type, model properties
 * @returns {Promise<Object>} Forecast data object
 */
window.WeatherAPI.getForecastData = async function(location, model) {
  // Check cache first
  const cacheKey = `${location.lat},${location.lon},${model.id}`;
  const cachedData = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  
  if (cachedData[cacheKey]) {
    const cachedEntry = cachedData[cacheKey];
    
    // Check if cache is still valid
    if (Date.now() - cachedEntry.timestamp < CACHE_EXPIRATION_MS) {
      console.log("✅ Using cached forecast data for", location.name);
      return cachedEntry.data;
    }
  }

  // If no valid cache, fetch new data
  console.log("Fetching fresh forecast data for", location.name);
  
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
    console.error("Error fetching forecast data:", error);
    throw error;
  }
}

/**
 * Get observation data for a location
 * @param {Object} location - Location object with lat, lon, name
 * @returns {Promise<Object>} Observation data object
 */
window.WeatherAPI.getObservationData = async function(location) {
  if (location.name && location.name.includes("Konstanz")) {
    const nowBerlin = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
    const currentDate = nowBerlin.split('T')[0];
    
    try {
      const [stationData, brightSkyData] = await Promise.all([
        window.WeatherAPI.getKonstanzWeatherStationData(currentDate),
        window.WeatherAPI.getBrightSkyObservationData(currentDate)
      ]);
      
      return {
        weatherStation: stationData,
        brightSky: brightSkyData
      };
    } catch (error) {
      console.warn("Could not load observation data:", error);
      return null;
    }
  }
  
  return null;
}

/**
 * Get weather data from Open-Meteo API with caching
 * @param {Object} location - Location object with lat, lon, name
 * @param {Object} model - Model object with id, type, model properties
 * @returns {Promise<Object>} Weather data object with forecast and observations
 */
window.WeatherAPI.getWeatherData = async function(location, model) {
  try {
    // Get forecast and observation data in parallel
    const [forecastData, observationData] = await Promise.all([
      window.WeatherAPI.getForecastData(location, model),
      window.WeatherAPI.getObservationData(location)
    ]);
    
    // Return unified data structure
    return {
      forecast: forecastData,
      observations: observationData
    };
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
