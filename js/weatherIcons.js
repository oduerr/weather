/**
 * Weather Icons Module
 * Central repository for weather code to icon mappings
 */

window.WeatherIcons = {
  /**
   * Weather code to emoji icon mapping
   * Based on WMO weather codes
   */
  iconMap: {
    "0": "☀️",   // Clear sky
    "1": "🌤️",   // Mainly clear
    "2": "⛅",   // Partly cloudy
    "3": "☁️",   // Overcast
    "45": "🌫️",  // Fog
    "48": "🌫️",  // Depositing rime fog
    "51": "🌦️",  // Light drizzle
    "53": "🌦️",  // Moderate drizzle
    "55": "🌦️",  // Dense drizzle
    "56": "🌧️",  // Light freezing drizzle
    "57": "🌧️",  // Dense freezing drizzle
    "61": "🌧️",  // Slight rain
    "63": "🌧️",  // Moderate rain
    "65": "🌧️",  // Heavy rain
    "66": "🌧️",  // Light freezing rain
    "67": "🌧️",  // Heavy freezing rain
    "71": "🌨️",  // Slight snow fall
    "73": "🌨️",  // Moderate snow fall
    "75": "🌨️",  // Heavy snow fall
    "77": "❄️",   // Snow grains
    "80": "🌦️",  // Slight rain showers
    "81": "🌦️",  // Moderate rain showers
    "82": "🌧️",  // Violent rain showers
    "85": "🌨️",  // Slight snow showers
    "86": "🌨️",  // Heavy snow showers
    "95": "⛈️",  // Thunderstorm
    "96": "⛈️",  // Thunderstorm with slight hail
    "99": "⛈️"   // Thunderstorm with heavy hail
  },

  /**
   * Get weather icon for a given weather code
   * @param {number|string} weatherCode - WMO weather code
   * @returns {string} Weather emoji icon
   */
  getIcon: function(weatherCode) {
    return this.iconMap[String(weatherCode)] || "❓";
  },

  /**
   * Get multiple icons for weather codes (for ensemble mode calculation)
   * @param {Array} weatherCodes - Array of weather codes
   * @returns {Array} Array of weather emoji icons
   */
  getIcons: function(weatherCodes) {
    return weatherCodes.map(code => this.getIcon(code));
  }
};
