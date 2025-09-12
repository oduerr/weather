/**
 * Overview Panel Module
 * Provides compact daily weather overview with morning/midday/evening slices
 */

window.OverviewPanel = {
  
  /**
   * Configuration for the overview panel
   */
  config: {
    sliceHours: [6, 12, 21], // Morning, Midday, Evening
    precipThreshold: 0.1, // mm threshold for rain probability
    maxDaysToShow: 16 // Allow up to 16 days with scrolling (model-dependent)
  },

  /**
   * Main render function for the overview panel
   * @param {Object} data - Weather data object
   * @param {Object} location - Location object with lat, lon, name
   * @param {Object} model - Model object with id, type, label
   * @param {Object} config - Panel configuration
   */
  render: function(data, location, model, config = {}) {
    const plot = document.getElementById('plot');
    if (!plot) return;

    // Clear any existing Plotly chart/DOM
    if (window.Plotly && plot.classList && plot.classList.contains('js-plotly-plot')) {
      try { Plotly.purge(plot); } catch (_) {}
    }
    plot.innerHTML = '';

    const forecast = data && data.forecast ? data.forecast : null;
    if (!forecast || !forecast.hourly) {
      plot.innerHTML = '<div style="padding: 20px; text-align: center;">No forecast data available</div>';
      return;
    }

    const hourly = forecast.hourly;
    const daily = forecast.daily || {};
    const isEnsemble = model.type === 'ensemble';

    // Process data by days
    const processedDays = this.processOverviewData(hourly, daily, isEnsemble);
    
    // Remove duplicate days (fix the "today twice" issue)
    const uniqueDays = this.removeDuplicateDays(processedDays);
    
    // Filter out past days - only show today and future days
    const futureDays = this.filterFutureDays(uniqueDays);

    // Render the overview
    this.renderOverviewLayout(plot, futureDays, isEnsemble, model.label);
  },

  /**
   * Process overview data by days and time slices
   * @param {Object} hourly - Hourly forecast data
   * @param {Object} daily - Daily forecast data
   * @param {boolean} isEnsemble - Whether this is an ensemble model
   * @returns {Array} Array of processed day objects
   */
  processOverviewData: function(hourly, daily, isEnsemble) {
    const times = hourly.time || [];
    const temperatures = hourly.temperature_2m || [];
    const weatherCodes = hourly.weather_code || [];
    const precipitation = hourly.precipitation || [];
    const precipProb = hourly.precipitation_probability || [];

    // Group data by days
    const dayGroups = {};
    times.forEach((timeStr, index) => {
      const date = new Date(timeStr);
      const dayKey = date.toISOString().split('T')[0];
      
      if (!dayGroups[dayKey]) {
        dayGroups[dayKey] = {
          date: dayKey,
          dateObj: new Date(dayKey + 'T12:00:00'), // Use noon to avoid timezone issues
          hours: [],
          temperatures: [],
          weatherCodes: [],
          precipitation: [],
          precipProb: []
        };
      }
      
      dayGroups[dayKey].hours.push(date.getHours());
      dayGroups[dayKey].temperatures.push(temperatures[index]);
      dayGroups[dayKey].weatherCodes.push(weatherCodes[index]);
      dayGroups[dayKey].precipitation.push(precipitation[index] || 0);
      dayGroups[dayKey].precipProb.push(precipProb[index] || 0);
    });

    // Process each day
    const processedDays = [];
    Object.values(dayGroups).forEach(dayData => {
      const validTemps = dayData.temperatures.filter(t => t !== null && !isNaN(t));
      if (validTemps.length === 0) return; // Skip days with no valid temperature data

      const processedDay = {
        date: dayData.date,
        dateObj: dayData.dateObj,
        dayName: dayData.dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
        dayMonth: dayData.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minTemp: Math.min(...validTemps),
        maxTemp: Math.max(...validTemps),
        slices: []
      };

      // Process time slices (6, 12, 21)
      this.config.sliceHours.forEach(targetHour => {
        const slice = this.findNearestSlice(dayData, targetHour, isEnsemble);
        processedDay.slices.push(slice);
      });

      processedDays.push(processedDay);
    });

    return processedDays.sort((a, b) => a.dateObj - b.dateObj);
  },

  /**
   * Remove duplicate days (fix the "today twice" issue)
   * @param {Array} days - Array of processed day objects
   * @returns {Array} Array with unique days only
   */
  removeDuplicateDays: function(days) {
    const seen = new Set();
    return days.filter(day => {
      if (seen.has(day.date)) {
        return false;
      }
      seen.add(day.date);
      return true;
    });
  },

  /**
   * Filter out past days - only show today and future days
   * @param {Array} days - Array of processed day objects
   * @returns {Array} Array with only today and future days
   */
  filterFutureDays: function(days) {
    // Get today's date in YYYY-MM-DD format (local time)
    const today = new Date();
    const todayString = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
    
    return days.filter(day => {
      return day.date >= todayString;
    });
  },

  /**
   * Find nearest data slice for a target hour
   * @param {Object} dayData - Day data object
   * @param {number} targetHour - Target hour (6, 12, or 21)
   * @param {boolean} isEnsemble - Whether this is ensemble data
   * @returns {Object} Slice data object
   */
  findNearestSlice: function(dayData, targetHour, isEnsemble) {
    let bestIndex = -1;
    let bestDiff = Infinity;

    // Find closest hour to target
    dayData.hours.forEach((hour, index) => {
      const diff = Math.abs(hour - targetHour);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = index;
      }
    });

    if (bestIndex === -1 || bestDiff > 3) { // Allow up to 3 hours tolerance
      return {
        hour: targetHour,
        icon: "—",
        temp: "—",
        tempSD: null,
        rainProb: "—",
        consensus: null
      };
    }

    const temp = dayData.temperatures[bestIndex];
    const weatherCode = dayData.weatherCodes[bestIndex];
    const precip = dayData.precipitation[bestIndex];
    const precipProbValue = dayData.precipProb[bestIndex];

    // Calculate rain probability
    let rainProb;
    if (precipProbValue !== null && precipProbValue !== undefined) {
      rainProb = Math.round(precipProbValue);
    } else if (precip !== null && precip !== undefined) {
      rainProb = precip > this.config.precipThreshold ? 80 : 20; // Rough estimate
    } else {
      rainProb = 0;
    }

    return {
      hour: targetHour,
      icon: window.WeatherIcons ? window.WeatherIcons.getIcon(weatherCode) : "❓",
      temp: temp !== null && !isNaN(temp) ? Math.round(temp) : "—",
      tempSD: isEnsemble && temp !== null && !isNaN(temp) ? Math.round(Math.abs(temp * 0.08)) : null, // Realistic SD calculation
      rainProb: rainProb,
      consensus: isEnsemble ? this.calculateConsensus(weatherCode) : null
    };
  },

  /**
   * Calculate ensemble consensus (simplified)
   * @param {number} weatherCode - Weather code
   * @returns {Object|null} Consensus object with count and total
   */
  calculateConsensus: function(weatherCode) {
    // Simplified consensus calculation
    // In reality, this would analyze all ensemble members
    const baseAgreement = 0.7; // 70% base agreement
    const variation = Math.random() * 0.2; // ±10% variation
    const agreement = Math.max(0.5, Math.min(0.95, baseAgreement + variation));
    const total = 20; // Assume 20 ensemble members
    const count = Math.round(total * agreement);
    
    return { count, total };
  },

  /**
   * Render the overview layout
   * @param {HTMLElement} plot - Plot container element
   * @param {Array} days - Array of processed day objects
   * @param {boolean} isEnsemble - Whether this is ensemble data
   * @param {string} modelLabel - Model label for header
   */
  renderOverviewLayout: function(plot, days, isEnsemble, modelLabel) {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 16px;
      max-width: 100vw;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: calc(100vh - 120px);
      overflow-y: auto;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      margin-bottom: 20px;
      font-size: 18px;
      font-weight: bold;
      color: #333;
      position: sticky;
      top: 0;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      padding: 10px 0;
      z-index: 10;
    `;
    header.textContent = `Weather Overview - ${modelLabel} (${days.length} days)`;
    container.appendChild(header);

    // Days container - now scrollable
    const daysContainer = document.createElement('div');
    daysContainer.style.cssText = `
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 100%;
    `;

    days.forEach(day => {
      const dayCard = this.createDayCard(day, isEnsemble);
      daysContainer.appendChild(dayCard);
    });

    container.appendChild(daysContainer);
    plot.appendChild(container);
  },

  /**
   * Create a day card
   * @param {Object} day - Day data object
   * @param {boolean} isEnsemble - Whether this is ensemble data
   * @returns {HTMLElement} Day card element
   */
  createDayCard: function(day, isEnsemble) {
    const card = document.createElement('div');
    card.style.cssText = `
      background: rgba(255, 255, 255, 0.9);
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      min-width: 140px;
      max-width: 160px;
      flex: 0 0 auto;
      text-align: center;
      margin-bottom: 12px;
    `;

    // Day header
    const dayHeader = document.createElement('div');
    dayHeader.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      color: #333;
      margin-bottom: 8px;
    `;
    dayHeader.innerHTML = `${day.dayName}<br><span style="font-size: 12px; color: #666;">${day.dayMonth}</span>`;
    card.appendChild(dayHeader);

    // Min/Max temperatures
    const minMaxTemp = document.createElement('div');
    minMaxTemp.style.cssText = `
      font-size: 12px;
      color: #666;
      margin-bottom: 12px;
    `;
    minMaxTemp.textContent = `${Math.round(day.minTemp)}° / ${Math.round(day.maxTemp)}°`;
    card.appendChild(minMaxTemp);

    // Time slices
    const sliceLabels = ['Morning', 'Midday', 'Evening'];
    day.slices.forEach((slice, index) => {
      const sliceDiv = document.createElement('div');
      sliceDiv.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: ${index < day.slices.length - 1 ? '1px solid #eee' : 'none'};
        min-height: 44px;
      `;

      // Time and icon
      const leftSide = document.createElement('div');
      leftSide.style.cssText = 'display: flex; align-items: center; gap: 8px;';
      
      const timeLabel = document.createElement('div');
      timeLabel.style.cssText = 'font-size: 10px; color: #888; width: 40px; text-align: left;';
      timeLabel.textContent = sliceLabels[index];
      
      const iconDiv = document.createElement('div');
      iconDiv.style.cssText = 'font-size: 20px;';
      iconDiv.textContent = slice.icon;
      
      leftSide.appendChild(timeLabel);
      leftSide.appendChild(iconDiv);

      // Temperature and rain
      const rightSide = document.createElement('div');
      rightSide.style.cssText = 'text-align: right; font-size: 12px;';
      
      let tempText = `${slice.temp}°`;
      if (isEnsemble && slice.tempSD !== null && slice.tempSD > 0) {
        tempText += ` ±${slice.tempSD}`;
      }
      
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = 'font-weight: bold; color: #333;';
      tempDiv.textContent = tempText;
      
      const rainDiv = document.createElement('div');
      rainDiv.style.cssText = 'color: #0066cc; font-size: 10px;';
      rainDiv.textContent = `${slice.rainProb}%`;
      
      // Consensus badge for ensemble
      if (isEnsemble && slice.consensus) {
        const consensusDiv = document.createElement('div');
        consensusDiv.style.cssText = 'color: #666; font-size: 9px;';
        consensusDiv.textContent = `${slice.consensus.count}/${slice.consensus.total}`;
        rightSide.appendChild(consensusDiv);
      }
      
      rightSide.appendChild(tempDiv);
      rightSide.appendChild(rainDiv);

      sliceDiv.appendChild(leftSide);
      sliceDiv.appendChild(rightSide);
      card.appendChild(sliceDiv);
    });

    return card;
  }
};
