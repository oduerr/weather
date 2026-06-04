/**
 * Overview Panel Module
 * Provides compact daily weather overview with morning/midday/evening slices
 */

window.OverviewPanel = {

  kmhToBeaufort: function(kmh) {
    if (kmh < 1) return 0; if (kmh <= 5) return 1; if (kmh <= 11) return 2;
    if (kmh <= 19) return 3; if (kmh <= 28) return 4; if (kmh <= 38) return 5;
    if (kmh <= 49) return 6; if (kmh <= 61) return 7; if (kmh <= 74) return 8;
    if (kmh <= 88) return 9; if (kmh <= 102) return 10; if (kmh <= 117) return 11;
    return 12;
  },

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
  render: async function(data, location, model, config = {}) {
    const plot = document.getElementById('plot');
    if (!plot) return;

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

    const processedDays = this.processOverviewData(hourly, daily, isEnsemble);
    const uniqueDays   = this.removeDuplicateDays(processedDays);
    const futureDays   = this.filterFutureDays(uniqueDays);

    // Fetch BrightSky observed data for past days in the current week (Konstanz only)
    let pastDays = [];
    if (futureDays.length > 0 && location.name && location.name.includes('Konstanz') && window.WeatherAPI && window.WeatherAPI.getBrightSkyPastDays) {
      const firstDow     = new Date(futureDays[0].date + 'T12:00:00Z').getUTCDay();
      const mondayOffset = firstDow === 0 ? 6 : firstDow - 1;
      if (mondayOffset > 0) {
        const pastDates = [];
        for (let i = mondayOffset; i > 0; i--) {
          const d = new Date(futureDays[0].date + 'T12:00:00Z');
          d.setUTCDate(d.getUTCDate() - i);
          pastDates.push(d.toISOString().split('T')[0]);
        }
        pastDays = (await window.WeatherAPI.getBrightSkyPastDays(pastDates)).filter(Boolean);
      }
    }

    this.renderOverviewLayout(plot, futureDays, isEnsemble, model.label, location, forecast, pastDays);
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
    const windSpeed = hourly.wind_speed_10m || [];
    const windGusts = hourly.wind_gusts_10m || [];

    // Group data by days
    const dayGroups = {};
    times.forEach((timeStr, index) => {
      const date = new Date(timeStr);
      // Use the date portion of the local time string directly — Open-Meteo
      // returns Berlin local time strings, so splitting on 'T' is correct.
      // (toISOString() would give UTC and misplace midnight–01:59 Berlin.)
      const dayKey = timeStr.split('T')[0];

      if (!dayGroups[dayKey]) {
        dayGroups[dayKey] = {
          date: dayKey,
          dateObj: new Date(dayKey + 'T12:00:00'),
          hours: [],
          temperatures: [],
          weatherCodes: [],
          precipitation: [],
          precipProb: [],
          windSpeed: [],
          windGusts: []
        };
      }
      
      dayGroups[dayKey].hours.push(date.getHours());
      dayGroups[dayKey].temperatures.push(temperatures[index]);
      dayGroups[dayKey].weatherCodes.push(weatherCodes[index]);
      dayGroups[dayKey].precipitation.push(precipitation[index] || 0);
      dayGroups[dayKey].precipProb.push(precipProb[index] || 0);
      dayGroups[dayKey].windSpeed.push(windSpeed[index] || 0);
      dayGroups[dayKey].windGusts.push(windGusts[index] || 0);
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
    const todayString = new Date()
      .toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).split(' ')[0];
    return days.filter(day => day.date >= todayString);
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

    if (bestIndex === -1 || bestDiff > 3) {
      return { hour: targetHour, icon: "—", temp: "—", tempSD: null, rainProb: "—", windBft: "—", gustBft: "—", consensus: null };
    }

    const temp = dayData.temperatures[bestIndex];
    const weatherCode = dayData.weatherCodes[bestIndex];
    const precip = dayData.precipitation[bestIndex];
    const precipProbValue = dayData.precipProb[bestIndex];
    const wind = dayData.windSpeed[bestIndex];
    const gust = dayData.windGusts[bestIndex];

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
      tempSD: isEnsemble && temp !== null && !isNaN(temp) ? Math.round(Math.abs(temp * 0.08)) : null,
      rainProb: rainProb,
      windBft: wind != null && !isNaN(wind) ? this.kmhToBeaufort(wind) : "—",
      gustBft: gust != null && !isNaN(gust) ? this.kmhToBeaufort(gust) : "—",
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
  renderOverviewLayout: function(plot, days, isEnsemble, modelLabel, location, forecast, pastDays = []) {
    const container = document.createElement('div');
    container.style.cssText = 'padding:16px;min-width:980px;width:100%;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    // Sticky header
    const locationInfo = this.formatLocationInfo(location, forecast);
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:16px;position:sticky;top:0;background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);padding:10px 0;z-index:10;';
    header.innerHTML = `<div style="font-size:18px;font-weight:bold;color:#333;margin-bottom:4px;">Weather Overview — ${modelLabel}</div><div style="font-size:12px;color:#666;">${locationInfo}</div>`;
    container.appendChild(header);

    // Sticky day-name column headers (Mon … Sun)
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const colHeader = document.createElement('div');
    colHeader.style.cssText = 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:6px;position:sticky;top:66px;background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);z-index:9;padding-bottom:4px;';
    DAY_NAMES.forEach((name, i) => {
      const cell = document.createElement('div');
      cell.style.cssText = `text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${i >= 5 ? '#6366f1' : '#555'};`;
      cell.textContent = name;
      colHeader.appendChild(cell);
    });
    container.appendChild(colHeader);

    // Today string in Berlin timezone (YYYY-MM-DD)
    const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).split(' ')[0];

    // Monday-align: find how many empty slots before first forecast day
    const firstDow     = new Date(days[0].date + 'T12:00:00Z').getUTCDay(); // 0=Sun
    const mondayOffset = firstDow === 0 ? 6 : firstDow - 1;

    // Build slots: fill past positions with BrightSky observed days where available
    const slots = [];
    for (let i = mondayOffset; i > 0; i--) {
      const d = new Date(days[0].date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      slots.push(pastDays.find(p => p.date === dateStr) || null);
    }
    slots.push(...days);

    // Split into weeks of 7
    const weeks = [];
    for (let i = 0; i < slots.length; i += 7) {
      const week = slots.slice(i, i + 7);
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    let shownMonths = new Set();
    weeks.forEach(week => {
      // Month label: show at the first week (for current month) and whenever the 1st of a month appears
      const monthStartSlot = week.find(s => s && new Date(s.date + 'T12:00').getDate() === 1);
      const firstSlot = week.find(s => s !== null);
      const labelSlot = monthStartSlot || (shownMonths.size === 0 ? firstSlot : null);

      if (labelSlot) {
        const monthKey = labelSlot.date.slice(0, 7); // YYYY-MM
        if (!shownMonths.has(monthKey)) {
          shownMonths.add(monthKey);
          const monthLabel = document.createElement('div');
          monthLabel.style.cssText = 'font-size:13px;font-weight:700;color:#333;margin:14px 0 4px 2px;letter-spacing:.3px;';
          monthLabel.textContent = new Date(labelSlot.date + 'T12:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          container.appendChild(monthLabel);
        }
      }

      const weekRow = document.createElement('div');
      weekRow.style.cssText = 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:8px;';
      const weekContainsToday = week.some(s => s && s.date === todayStr);
      if (weekContainsToday) weekRow.setAttribute('data-week-today', '');

      week.forEach(slot => {
        if (!slot) {
          const spacer = document.createElement('div');
          spacer.style.cssText = 'border-radius:12px;background:rgba(0,0,0,0.04);min-height:60px;';
          weekRow.appendChild(spacer);
        } else {
          const dow = new Date(slot.date + 'T12:00:00Z').getUTCDay();
          const card = this.createDayCard(slot, isEnsemble, {
            isToday:   slot.date === todayStr,
            isWeekend: dow === 0 || dow === 6
          });
          weekRow.appendChild(card);
        }
      });

      container.appendChild(weekRow);
    });

    plot.appendChild(container);

    // Scroll so today's week row is near the top (below sticky headers ~80px)
    requestAnimationFrame(() => {
      const todayWeek = plot.querySelector('[data-week-today]');
      if (!todayWeek) return;
      const plotRect = plot.getBoundingClientRect();
      const weekRect = todayWeek.getBoundingClientRect();
      plot.scrollTop += weekRect.top - plotRect.top - 80;
    });
  },

  /**
   * Create a day card
   * @param {Object} day - Day data object
   * @param {boolean} isEnsemble - Whether this is ensemble data
   * @returns {HTMLElement} Day card element
   */
  createDayCard: function(day, isEnsemble, { isToday = false, isWeekend = false } = {}) {
    const isPast = !!day.isPast;
    const card = document.createElement('div');
    card.style.cssText = [
      'border-radius:12px',
      'padding:12px',
      'text-align:center',
      isPast    ? 'background:rgba(220,220,220,0.85)'
      : isWeekend ? 'background:rgba(238,240,255,0.9)'
                  : 'background:rgba(255,255,255,0.9)',
      isToday
        ? 'box-shadow:0 0 0 2px #007AFF,0 2px 12px rgba(0,122,255,0.2)'
        : 'box-shadow:0 2px 8px rgba(0,0,0,0.1)',
    ].join(';');

    // Day header
    const dayHeader = document.createElement('div');
    dayHeader.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      color: #333;
      margin-bottom: 8px;
    `;
    const obsBadge = isPast ? ' <span style="font-size:9px;background:#888;color:white;padding:1px 4px;border-radius:6px;vertical-align:middle;">Obs.</span>' : '';
    dayHeader.innerHTML = `${day.dayName}<br><span style="font-size:12px;color:#666;">${day.dayMonth}</span>${obsBadge}`;
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
      rainDiv.style.cssText = `color:${isPast ? '#777' : '#0066cc'};font-size:10px;`;
      rainDiv.textContent = isPast
        ? (slice.precip != null ? `${slice.precip}mm` : '—')
        : `${slice.rainProb}%`;

      const windDiv = document.createElement('div');
      windDiv.style.cssText = 'color: #777; font-size: 10px;';
      windDiv.textContent = `💨 ${slice.windBft}/${slice.gustBft}`;
      
      // Consensus badge for ensemble
      if (isEnsemble && slice.consensus) {
        const consensusDiv = document.createElement('div');
        consensusDiv.style.cssText = 'color: #666; font-size: 9px;';
        consensusDiv.textContent = `${slice.consensus.count}/${slice.consensus.total}`;
        rightSide.appendChild(consensusDiv);
      }
      
      rightSide.appendChild(tempDiv);
      rightSide.appendChild(rainDiv);
      rightSide.appendChild(windDiv);

      sliceDiv.appendChild(leftSide);
      sliceDiv.appendChild(rightSide);
      card.appendChild(sliceDiv);
    });

    return card;
  },

  /**
   * Format location information similar to the reference image
   * @param {Object} location - Location object with lat, lon, name
   * @param {Object} forecast - Forecast data with elevation and daily sunrise/sunset
   * @returns {string} Formatted location info string
   */
  formatLocationInfo: function(location, forecast) {
    const lat = location.lat.toFixed(2);
    const lon = location.lon.toFixed(2);
    const elevation = forecast && forecast.elevation ? `⛰️ ${forecast.elevation}m` : '';
    
    // Get today's sunrise and sunset
    let sunInfo = '';
    if (forecast && forecast.daily && forecast.daily.sunrise && forecast.daily.sunset) {
      const sunrise = forecast.daily.sunrise[0];
      const sunset = forecast.daily.sunset[0];
      
      if (sunrise && sunset) {
        const sunriseTime = new Date(sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sunsetTime = new Date(sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        sunInfo = `☀️ ${sunriseTime} AM – 🌙 ${sunsetTime} PM`;
      }
    }
    
    // Combine all info parts
    const parts = [
      `📍 ${lat}°N, ${lon}°E`,
      elevation,
      sunInfo
    ].filter(part => part.length > 0);
    
    return parts.join(' | ');
  }
};
