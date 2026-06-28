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

  // Filter data for current day in Berlin timezone
  const todayData = stationData.filter(measurement => {
    const berlinDate = new Date(measurement.time)
      .toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).split(' ')[0];
    return berlinDate === currentDate;
  });

  if (todayData.length === 0) {
    return { temperature: [], waterTemperature: [], times: [] };
  }

  // Group data by hour and average measurements (~4 per hour)
  const hourlyGroups = {};

  todayData.forEach(measurement => {
    const timeLocal = new Date(measurement.time)
      .toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
    const hour = parseInt(timeLocal.split('T')[1].split(':')[0], 10);
    const hourKey = timeLocal.slice(0, 11) + hour.toString().padStart(2, '0') + ':00:00';
    
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
  // Go back 2h before UTC midnight so Berlin midnight (UTC+1/+2) is always included
  const startTime = new Date(currentDate + "T00:00:00Z");
  startTime.setTime(startTime.getTime() - 2 * 60 * 60 * 1000);
  
  // Format dates like the Python example
  const formatDate = (date) => {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };
  
  const rawData = await window.WeatherAPI.fetchWeatherStationData(formatDate(startTime), formatDate(endTime));
  
  // If API fails due to CORS or no data available, return NaN values
  if (rawData.length === 0) {
    console.log("⚠️ Konstanz weather station data unavailable - returning NaN values");
    return window.WeatherAPI.getMockWeatherStationData(currentDate);
  }
  
  return window.WeatherAPI.processWeatherStationData(rawData, currentDate);
}

/**
 * Return NaN values when no real weather station data is available
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Object} Weather station data with NaN values
 */
window.WeatherAPI.getMockWeatherStationData = function(currentDate) {
  const mockData = {
    temperature: [],
    waterTemperature: [],
    times: []
  };

  // Generate NaN values for the current day (hourly)
  const now = new Date();
  const currentHour = now.getHours();

  for (let hour = 0; hour <= currentHour; hour++) {
    const time = `${currentDate}T${hour.toString().padStart(2, '0')}:00:00`;

    mockData.temperature.push(NaN);
    mockData.waterTemperature.push(NaN);
    mockData.times.push(time);
  }

  console.log("⚠️ No real weather station data available - returning NaN values for", mockData.times.length, "measurements");
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
    date: currentDate,
    tz: 'Europe/Berlin'
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
          const airTemp = data.temperature?.value || NaN;
          const waterTemp = data.temperature_water?.value || NaN;
          callback(airTemp, waterTemp);
      })
      .catch(error => {
          console.error("Error fetching Konstanz weather:", error);
          callback(NaN, NaN);  // Fallback values
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
      "precipitation", "cloud_cover", "weather_code", "is_day",
      "uv_index", "uv_index_clear_sky", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
    ];
    apiUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?`;
  } else {
    hourlyVars = [
      "temperature_2m", "relative_humidity_2m", "dew_point_2m",
      "precipitation", "precipitation_probability", "weather_code", "is_day",
      "cloud_cover", "cloud_cover_low", "cloud_cover_mid",
      "cloud_cover_high", "visibility", "sunshine_duration",
      "uv_index", "uv_index_clear_sky", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
    ];
    apiUrl = `https://api.open-meteo.com/v1/forecast?`;
  }

  const dailyVars = ["sunrise", "sunset"];

  // Always request maximum possible days (16) and use whatever data we get back
  // This ensures we get the maximum available data for each model
  const maxForecastDays = 16;
  console.log(`📅 Requesting maximum ${maxForecastDays} days forecast for model: ${model.model} (will use whatever data is returned)`);

  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    hourly: hourlyVars.join(","),
    "timezone": "Europe/Berlin",
    models: model.model,
    forecast_days: maxForecastDays  // Always request maximum, use what we get
  });
  
  // Only add daily parameters for deterministic models
  if (model.type !== "ensemble") {
    params.append("daily", dailyVars.join(","));
  }

  try {
    const response = await fetch(apiUrl + params.toString());
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 429) throw new Error('Rate limit exceeded (429) — try again in a few minutes.');
      if (response.status >= 500) throw new Error(`Open-Meteo server error (${response.status}).`);
      throw new Error(`Open-Meteo returned HTTP ${response.status}. ${body.slice(0, 120)}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(`Open-Meteo: ${data.reason || JSON.stringify(data)}`);

    cachedData[cacheKey] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
    return data;
  } catch (error) {
    console.error("Error fetching forecast data:", error);
    throw error;
  }
}

/**
 * Fetch BrightSky observed day summaries for a list of past dates.
 * Returns array of day objects compatible with the overview panel format.
 */
window.WeatherAPI.getBrightSkyPastDays = async function(dates) {
  if (!dates || dates.length === 0) return [];

  const ICON_MAP = {
    'clear-day': '☀️', 'clear-night': '🌙',
    'partly-cloudy-day': '⛅', 'partly-cloudy-night': '⛅',
    'cloudy': '☁️', 'overcast': '☁️', 'fog': '🌫️',
    'rain': '🌧️', 'drizzle': '🌦️', 'sleet': '🌨️',
    'snow': '🌨️', 'hail': '⛈️', 'thunderstorm': '⛈️', 'wind': '💨'
  };
  const bft = kmh => {
    if (!kmh || kmh < 1) return 0;
    if (kmh <= 5) return 1; if (kmh <= 11) return 2; if (kmh <= 19) return 3;
    if (kmh <= 28) return 4; if (kmh <= 38) return 5; if (kmh <= 49) return 6;
    if (kmh <= 61) return 7; if (kmh <= 74) return 8; return 9;
  };

  const raws = await Promise.all(
    dates.map(d => window.WeatherAPI.fetchBrightSkyHistoricalWeather(d).catch(() => null))
  );

  return dates.map((dateStr, idx) => {
    const raw = raws[idx];
    if (!raw || !raw.weather) return null;

    const obs = raw.weather.filter(o => {
      const local = new Date(o.timestamp)
        .toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
      return local.split('T')[0] === dateStr;
    });
    if (!obs.length) return null;

    const temps = obs.map(o => o.temperature).filter(t => t != null && !isNaN(t));
    if (!temps.length) return null;

    // Precipitation windows: sum all observations in the period ending at each slice.
    // Morning = midnight–06:00, Midday = 06:00–12:00, Evening = 12:00–21:00
    const WINDOWS = [
      { hour: 6,  from: 0,  to: 6  },
      { hour: 12, from: 6,  to: 12 },
      { hour: 21, from: 12, to: 21 },
    ];

    // Helper: get Berlin hour for an observation
    const berlinHour = o => parseInt(
      new Date(o.timestamp).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' })
        .replace(' ', 'T').split('T')[1], 10
    );

    const slices = WINDOWS.map(({ hour, from, to }) => {
      // Representative observation for icon/temp/wind: nearest to slice hour
      let best = null, bestDiff = Infinity;
      obs.forEach(o => {
        const diff = Math.abs(berlinHour(o) - hour);
        if (diff < bestDiff) { bestDiff = diff; best = o; }
      });

      // Sum precipitation across the window
      const windowPrecip = obs
        .filter(o => { const h = berlinHour(o); return h >= from && h < to; })
        .reduce((sum, o) => sum + (o.precipitation ?? o.precipitation_10 ?? 0), 0);

      if (!best || bestDiff > 3) return { hour, icon: '—', temp: '—', precip: Math.round(windowPrecip * 10) / 10, windBft: '—', gustBft: '—', isPast: true };
      const wind = best.wind_speed ?? best.wind_speed_10 ?? 0;
      const gust = best.wind_gust ?? best.wind_gust_speed_10 ?? best.wind_gust_speed ?? 0;
      return {
        hour,
        icon: ICON_MAP[best.icon] || '⛅',
        temp: best.temperature != null ? Math.round(best.temperature) : '—',
        precip: Math.round(windowPrecip * 10) / 10,
        windBft: bft(wind),
        gustBft: bft(gust),
        isPast: true
      };
    });

    const dateObj = new Date(dateStr + 'T12:00:00');
    return {
      date: dateStr,
      dateObj,
      dayName: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
      dayMonth: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      minTemp: Math.min(...temps),
      maxTemp: Math.max(...temps),
      slices,
      isPast: true
    };
  });
};

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
      
      // Compute last observation time from BrightSky (if available)
      let lastObsTime = null;
      if (brightSkyData && Array.isArray(brightSkyData.times) && brightSkyData.times.length > 0) {
        lastObsTime = brightSkyData.times[brightSkyData.times.length - 1];
        // Attach to brightSky object for convenience
        brightSkyData.lastObsTime = lastObsTime;
      }
      
      return {
        weatherStation: stationData,
        brightSky: brightSkyData,
        lastObsTime: lastObsTime
      };
    } catch (error) {
      console.warn("Could not load observation data:", error);
      return null;
    }
  }
  
  return null;
}

/**
 * Formats a Unix timestamp representing model initialization time
 * into a short string like "Jun 3, 06:00 UTC".
 */
window.WeatherAPI.formatInitTime = function(unixTime) {
  if (!unixTime) return "";
  const d = new Date(unixTime * 1000);
  const pad = n => String(n).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  return `${month} ${day}, ${hours}:${minutes} UTC`;
};

/**
 * Fetches model run/update metadata from Open-Meteo static folder
 */
window.WeatherAPI.getModelMetadata = async function(model) {
  const METADATA_PATHS = {
    "ecmwf_aifs025_single": "ecmwf_aifs025_single",
    "gfs_graphcast025": "ncep_gfs_graphcast025",
    "best_match": "dwd_icon_d2", 
    "icon_d2": "dwd_icon_d2",
    "icon_seamless": "dwd_icon_d2", 
    "icon_eu": "dwd_icon_eu",
    "icon_global": "dwd_icon",
    "meteoswiss_icon_ch1": "meteoswiss_icon_ch1",
    "meteoswiss_icon_ch2": "meteoswiss_icon_ch2",
    "meteofrance_arome_france_hd": "meteofrance_arome_france_hd",
    "arome_france": "meteofrance_arome_france0025",
    "arpege_europe": "meteofrance_arpege_europe",
    "meteofrance_arpege_world": "meteofrance_arpege_world025",
    "ecmwf_ifs025": "ecmwf_ifs025",
    "gfs_global": "ncep_gfs025",
    "ukmo_global_deterministic_10km": "ukmo_global_deterministic_10km",
    "ukmo_uk_deterministic_2km": "ukmo_uk_deterministic_2km",
    "gem_global": "cmc_gem_gdps_15km",
    "jma_gsm": "jma_gsm",
    "bom_access_global": "bom_access_global",
    "kma_gdps": "kma_gdps",
    "knmi_harmonie_arome_europe": "knmi_harmonie_arome_europe",
    "dmi_harmonie_arome_europe": "dmi_harmonie_arome_europe",
    "gfs025": "ncep_gfs025"
  };

  const ENSEMBLE_METADATA_PATHS = {
    "meteoswiss_icon_ch1": "meteoswiss_icon_ch1_ensemble",
    "meteoswiss_icon_ch2": "meteoswiss_icon_ch2_ensemble",
    "icon_d2": "dwd_icon_d2_eps",
    "icon_eu": "dwd_icon_eu_eps",
    "icon_global": "dwd_icon_eps",
    "ecmwf_ifs025": "ecmwf_ifs025_ensemble",
    "gfs025": "ncep_gefs025"
  };

  const isEnsemble = model.type === "ensemble";
  const folderName = isEnsemble
    ? (ENSEMBLE_METADATA_PATHS[model.model] || model.model)
    : (METADATA_PATHS[model.model] || model.model);

  // Use cache in localStorage (1h TTL)
  const cacheKey = `meta_${folderName}_${isEnsemble ? 'ensemble' : 'deterministic'}`;
  const cachedMeta = localStorage.getItem(cacheKey);
  if (cachedMeta) {
    try {
      const entry = JSON.parse(cachedMeta);
      if (Date.now() - entry.timestamp < 3600000) { // 1h
        return entry.data;
      }
    } catch(e) {}
  }

  const domain = isEnsemble ? "ensemble-api.open-meteo.com" : "api.open-meteo.com";
  const url = `https://${domain}/data/${folderName}/static/meta.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Metadata API returned " + res.status);
    const data = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  } catch(err) {
    console.error("Failed to load model metadata:", err);
    return null;
  }
};

/**
 * Get weather data from Open-Meteo API with caching
 * @param {Object} location - Location object with lat, lon, name
 * @param {Object} model - Model object with id, type, model properties
 * @returns {Promise<Object>} Weather data object with forecast and observations
 */
window.WeatherAPI.getWeatherData = async function(location, model) {
  // Observations are independent — always fetch, even if forecast fails
  const observationPromise = window.WeatherAPI.getObservationData(location)
    .catch(err => { console.warn("Observation data failed:", err); return null; });

  let forecastData = null;
  let forecastError = null;
  try {
    forecastData = await window.WeatherAPI.getForecastData(location, model);
    try {
      const metadata = await window.WeatherAPI.getModelMetadata(model);
      if (metadata) forecastData.model_metadata = metadata;
    } catch (metaErr) {
      console.warn("Could not load model metadata:", metaErr);
    }
  } catch (error) {
    forecastError = error;
    console.error("Open-Meteo forecast failed:", error);
  }

  const observationData = await observationPromise;

  return {
    forecast: forecastData,
    observations: observationData,
    forecastError: forecastError ? forecastError.message : null
  };
}

/**
 * Load fixture data for local testing
 * @returns {Promise<Object>} Sample weather data
 */
window.WeatherAPI.loadFixtureData = async function() {
  try {
    // Use existing konstanz_weather.json fixture file
    const response = await fetch('./fixtures/konstanz_weather.json');
    const data = await response.json();
    console.log("✅ Loaded fixture data from konstanz_weather.json");
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
window.WeatherAPI.getWeatherDataWithFallback = async function(location, model) {
  return await window.WeatherAPI.getWeatherData(location, model);
}
