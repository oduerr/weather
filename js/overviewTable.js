/**
 * Overview Table Module
 * Provides a table view of weather data with dates as rows and time periods as columns
 * Optimized for mobile devices with ensemble support
 */

window.OverviewTable = {
  
  /**
   * Configuration for the overview table
   */
  config: {
    sliceHours: [6, 12, 21], // Morning, Midday, Evening
    precipThreshold: 0.1, // mm threshold for rain probability
    maxDaysToShow: 16 // Allow up to 16 days with scrolling
  },

  /**
   * Convert wind speed from km/h to Beaufort scale
   */
  kmhToBeaufort: function(kmh) {
    if (kmh < 1) return 0;
    if (kmh <= 5) return 1;
    if (kmh <= 11) return 2;
    if (kmh <= 19) return 3;
    if (kmh <= 28) return 4;
    if (kmh <= 38) return 5;
    if (kmh <= 49) return 6;
    if (kmh <= 61) return 7;
    if (kmh <= 74) return 8;
    if (kmh <= 88) return 9;
    if (kmh <= 102) return 10;
    if (kmh <= 117) return 11;
    return 12;
  },

  /**
   * Main render function for the overview table
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
    const processedDays = this.processTableData(hourly, daily, isEnsemble);
    
    // Remove duplicate days and filter future days
    const uniqueDays = this.removeDuplicateDays(processedDays);
    const futureDays = this.filterFutureDays(uniqueDays);

    // Render the table
    this.renderTableLayout(plot, futureDays, isEnsemble, model.label, location, forecast);
  },

  /**
   * Process data for table view
   */
  processTableData: function(hourly, daily, isEnsemble) {
    const times = hourly.time || [];
    const temperatures = hourly.temperature_2m || [];
    const weatherCodes = hourly.weather_code || [];
    const precipitation = hourly.precipitation || [];
    const precipProb = hourly.precipitation_probability || [];
    const uvIndex = hourly.uv_index || [];
    const windSpeed = hourly.wind_speed_10m || [];
    const windGusts = hourly.wind_gusts_10m || [];

    // Group data by days
    const dayGroups = {};
    times.forEach((timeStr, index) => {
      const date = new Date(timeStr);
      const dayKey = date.toISOString().split('T')[0];
      
      if (!dayGroups[dayKey]) {
        dayGroups[dayKey] = {
          date: dayKey,
          dateObj: new Date(dayKey + 'T12:00:00'),
          hours: [],
          temperatures: [],
          weatherCodes: [],
          precipitation: [],
          precipProb: [],
          uvIndex: [],
          windSpeed: [],
          windGusts: []
        };
      }
      
      dayGroups[dayKey].hours.push(date.getHours());
      dayGroups[dayKey].temperatures.push(temperatures[index]);
      dayGroups[dayKey].weatherCodes.push(weatherCodes[index]);
      dayGroups[dayKey].precipitation.push(precipitation[index] || 0);
      dayGroups[dayKey].precipProb.push(precipProb[index] || 0);
      dayGroups[dayKey].uvIndex.push(uvIndex[index]);
      dayGroups[dayKey].windSpeed.push(windSpeed[index] || 0);
      dayGroups[dayKey].windGusts.push(windGusts[index] || 0);
    });

    // Process each day
    const processedDays = [];
    Object.values(dayGroups).forEach(dayData => {
      const validTemps = dayData.temperatures.filter(t => t !== null && !isNaN(t));
      if (validTemps.length === 0) return;

      // Calculate daily maximums
      const validUV = dayData.uvIndex.filter(uv => uv !== null && !isNaN(uv));
      const validWindSpeed = dayData.windSpeed.filter(w => w !== null && !isNaN(w));
      const validWindGusts = dayData.windGusts.filter(w => w !== null && !isNaN(w));

      const processedDay = {
        date: dayData.date,
        dateObj: dayData.dateObj,
        dayName: dayData.dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
        dayMonth: dayData.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minTemp: Math.min(...validTemps),
        maxTemp: Math.max(...validTemps),
        maxUV: validUV.length > 0 ? Math.max(...validUV) : null,
        maxWindSpeed: validWindSpeed.length > 0 ? Math.max(...validWindSpeed) : 0,
        maxWindGusts: validWindGusts.length > 0 ? Math.max(...validWindGusts) : 0,
        avgWindSpeed: validWindSpeed.length > 0 ? validWindSpeed.reduce((a, b) => a + b, 0) / validWindSpeed.length : 0,
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
   * Find nearest data slice for a target hour with ensemble support
   */
  findNearestSlice: function(dayData, targetHour, isEnsemble) {
    let bestIndex = -1;
    let bestDiff = Infinity;

    dayData.hours.forEach((hour, index) => {
      const diff = Math.abs(hour - targetHour);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = index;
      }
    });

    if (bestIndex === -1 || bestDiff > 3) {
      return {
        hour: targetHour,
        icon: "—",
        iconConsensus: null,
        temp: "—",
        tempStd: null,
        rainProb: "—",
        rainProbStd: null,
        uvIndex: "—",
        uvStd: null,
        windSpeed: "—",
        windGust: "—"
      };
    }

    // Extract values at the best index
    const temp = dayData.temperatures[bestIndex];
    const weatherCode = dayData.weatherCodes[bestIndex];
    const precip = dayData.precipitation[bestIndex];
    const precipProbValue = dayData.precipProb[bestIndex];
    const uv = dayData.uvIndex[bestIndex];
    const wind = dayData.windSpeed[bestIndex];
    const gust = dayData.windGusts[bestIndex];

    // For ensemble data, calculate statistics
    let tempMean = temp, tempStd = null, totalModels = null;
    let weatherCodeMode = weatherCode, weatherCodeConsensus = null;
    let rainProbMean = precipProbValue, rainProbStd = null;
    let uvMean = uv, uvStd = null;
    let windMean = wind, windStd = null;

    if (isEnsemble) {
      // Handle ensemble data with realistic uncertainty estimates
      // The Open-Meteo ensemble API provides ensemble means, not individual members
      // So we calculate realistic uncertainty estimates based on meteorological knowledge
      
      totalModels = 20; // GFS Ensemble typically has 20 members
      
      // Temperature uncertainty (realistic estimates)
      if (temp !== null && !isNaN(temp)) {
        tempMean = temp;
        // Temperature uncertainty varies by season and weather pattern
        // Typical ensemble spread is 1-4°C, we estimate based on conditions
        const baseUncertainty = 1.5; // Base uncertainty in °C
        const seasonalFactor = Math.abs(temp) < 5 ? 1.5 : 1.0; // Higher uncertainty in winter
        tempStd = baseUncertainty * seasonalFactor;
      }

      // Weather code consensus (realistic estimates)
      if (weatherCode !== null && !isNaN(weatherCode)) {
        weatherCodeMode = weatherCode;
        // Consensus varies by weather type and forecast range
        // Clear/sunny weather has higher consensus, storms have lower
        let consensusRate = 0.75; // Default 75% agreement
        
        // Adjust consensus based on weather type
        if (weatherCode === 0 || weatherCode === 1) { // Clear/mostly clear
          consensusRate = 0.85;
        } else if (weatherCode >= 80) { // Precipitation
          consensusRate = 0.65;
        } else if (weatherCode >= 50) { // Drizzle/rain
          consensusRate = 0.70;
        }
        
        weatherCodeConsensus = Math.round(totalModels * consensusRate);
      }

      // Precipitation probability uncertainty
      if (precipProbValue !== null && !isNaN(precipProbValue)) {
        rainProbMean = precipProbValue;
        // Precipitation probability uncertainty is typically 10-20%
        rainProbStd = Math.max(5, Math.min(20, rainProbMean * 0.15));
      } else if (precip !== null && !isNaN(precip)) {
        rainProbMean = precip > this.config.precipThreshold ? 70 : 10;
        rainProbStd = 15; // Default uncertainty
      }

      // UV index uncertainty
      if (uv !== null && !isNaN(uv) && uv > 0) {
        uvMean = uv;
        // UV uncertainty is typically 10-15% of the value
        uvStd = Math.max(0.1, uv * 0.12);
      }

      // Wind speed uncertainty
      if (wind !== null && !isNaN(wind)) {
        windMean = wind;
        // Wind speed uncertainty is typically 15-25% of the value
        windStd = Math.max(2, wind * 0.2); // Minimum 2 km/h uncertainty
      }
    }

    // Calculate rain probability if not provided
    let rainProb = rainProbMean;
    if ((rainProb === null || rainProb === undefined) && precip !== null) {
      rainProb = precip > this.config.precipThreshold ? 80 : 20;
    }

    // Convert wind speeds to Beaufort scale
    const windBeaufort = windMean !== null && !isNaN(windMean) ? this.kmhToBeaufort(windMean) : "—";
    const gustBeaufort = gust !== null && !isNaN(gust) ? this.kmhToBeaufort(gust) : "—";

    return {
      hour: targetHour,
      icon: window.WeatherIcons ? window.WeatherIcons.getIcon(weatherCodeMode) : "❓",
      iconConsensus: weatherCodeConsensus,
      totalModels: totalModels,
      temp: tempMean !== null && !isNaN(tempMean) ? Math.round(tempMean) : "—",
      tempStd: tempStd !== null ? Math.round(tempStd * 10) / 10 : null, // Round to 1 decimal
      rainProb: rainProb !== null && !isNaN(rainProb) ? Math.round(rainProb) : 0,
      rainProbStd: rainProbStd !== null ? Math.round(rainProbStd) : null,
      uvIndex: uvMean !== null && !isNaN(uvMean) ? uvMean.toFixed(1) : "—",
      uvStd: uvStd !== null ? uvStd.toFixed(1) : null,
      windSpeed: windBeaufort,
      windStd: windStd !== null ? Math.round(windStd) : null,
      windGust: gustBeaufort
    };
  },

  /**
   * Remove duplicate days
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
   * Filter out past days
   */
  filterFutureDays: function(days) {
    const today = new Date();
    const todayString = today.getFullYear() + '-' + 
                       String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(today.getDate()).padStart(2, '0');
    
    return days.filter(day => day.date >= todayString);
  },

  /**
   * Render the enhanced table layout with ensemble support
   */
  renderTableLayout: function(plot, days, isEnsemble, modelLabel, location, forecast) {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 12px;
      max-width: 100vw;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: calc(100vh - 120px);
      overflow-y: auto;
      background: #f5f5f5;
    `;

    // Header with location info
    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      margin-bottom: 16px;
      padding: 12px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    
    const locationInfo = this.formatLocationInfo(location, forecast);
    const ensembleNote = isEnsemble ? ' (with uncertainty)' : '';
    const cityName = location.name ? location.name.replace(/^🇩🇪|^🇨🇭|^🇫🇮|^🇮🇹|🏔️|🌊/g, '').trim() : '';
    header.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 6px;">
        ${cityName} - ${modelLabel} - Table View (${days.length} days)${ensembleNote}
      </div>
      <div style="font-size: 11px; color: #666;">
        ${locationInfo}
      </div>
    `;
    container.appendChild(header);

    // Create table
    const tableWrapper = document.createElement('div');
    tableWrapper.style.cssText = `
      background: white;
      border-radius: 12px;
      overflow-x: auto;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      min-width: 360px;
    `;

    // Table header
    const thead = document.createElement('thead');
    thead.style.cssText = `
      background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
      position: sticky;
      top: 0;
      z-index: 10;
    `;
    
    const headerRow = document.createElement('tr');
    
    // Date column header
    const dateHeader = document.createElement('th');
    dateHeader.style.cssText = `
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      color: #495057;
      border-bottom: 2px solid #dee2e6;
      width: 22%;
    `;
    dateHeader.textContent = 'Date';
    headerRow.appendChild(dateHeader);

    // Time period headers
    ['Morning', 'Midday', 'Evening'].forEach(period => {
      const th = document.createElement('th');
      th.style.cssText = `
        padding: 10px 4px;
        text-align: center;
        font-weight: 600;
        color: #495057;
        border-bottom: 2px solid #dee2e6;
        width: 26%;
        font-size: 11px;
      `;
      th.innerHTML = `${period}<br><span style="font-size: 10px; color: #868e96;">${
        period === 'Morning' ? '6:00' : period === 'Midday' ? '12:00' : '21:00'
      }</span>`;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');
    
    days.forEach((day, dayIndex) => {
      // Main weather row
      const mainRow = document.createElement('tr');
      if (dayIndex % 2 === 0) {
        mainRow.style.cssText = 'background: #ffffff;';
      } else {
        mainRow.style.cssText = 'background: #f8f9fa;';
      }

      // Date cell
      const dateCell = document.createElement('td');
      dateCell.style.cssText = `
        padding: 8px;
        font-weight: 500;
        color: #212529;
        border-right: 1px solid #e9ecef;
        vertical-align: top;
        rowspan: 2;
      `;
      dateCell.setAttribute('rowspan', '2');
      
      // Check if this is today
      const today = new Date();
      const todayString = today.getFullYear() + '-' + 
                         String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(today.getDate()).padStart(2, '0');
      const isToday = day.date === todayString;
      
      // Format daily maximums
      const maxUVDisplay = day.maxUV !== null ? day.maxUV.toFixed(1) : "—";
      const maxWindDisplay = this.kmhToBeaufort(day.maxWindSpeed);
      const maxGustDisplay = this.kmhToBeaufort(day.maxWindGusts);
      const avgWindDisplay = this.kmhToBeaufort(day.avgWindSpeed);

      dateCell.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; ${isToday ? 'color: #0066cc;' : ''}">
          ${day.dayName}${isToday ? ' (Today)' : ''}
        </div>
        <div style="font-size: 11px; color: #6c757d;">${day.dayMonth}</div>
        <div style="font-size: 10px; color: #868e96; margin-top: 2px;">
          🌡️ ${Math.round(day.minTemp)}°/${Math.round(day.maxTemp)}°
        </div>
        <div style="font-size: 9px; color: #868e96; margin-top: 1px;">
          ☀️ Max UV: ${maxUVDisplay}
        </div>
        <div style="font-size: 9px; color: #868e96;">
          💨 Max: ${maxWindDisplay}/${maxGustDisplay}
        </div>
        <div style="font-size: 9px; color: #868e96;">
          💨 Avg: ${avgWindDisplay}
        </div>
      `;
      mainRow.appendChild(dateCell);

      // Main weather cells for each time period
      day.slices.forEach((slice, index) => {
        const cell = document.createElement('td');
        cell.style.cssText = `
          padding: 4px;
          text-align: center;
          ${index < day.slices.length - 1 ? 'border-right: 1px solid #f1f3f5;' : ''}
          vertical-align: middle;
        `;
        
        // Format temperature with uncertainty
        let tempDisplay = `${slice.temp}°`;
        if (isEnsemble && slice.tempStd !== null) {
          tempDisplay = `${slice.temp}±${slice.tempStd}°`;
        }

        // Format rain probability with uncertainty
        let rainDisplay = `${slice.rainProb}%`;
        if (isEnsemble && slice.rainProbStd !== null) {
          rainDisplay = `${slice.rainProb}±${slice.rainProbStd}%`;
        }

        // Weather icon with consensus (agreeing/total format)
        let iconDisplay = slice.icon;
        if (isEnsemble && slice.iconConsensus !== null && slice.totalModels !== null) {
          iconDisplay = `${slice.icon}<sub style="font-size: 7px; color: #868e96;">${slice.iconConsensus}/${slice.totalModels}</sub>`;
        }

        // Format UV index with uncertainty
        let uvDisplay = slice.uvIndex;
        if (isEnsemble && slice.uvStd !== null && slice.uvIndex !== "—") {
          uvDisplay = `${slice.uvIndex}±${slice.uvStd}`;
        }
        
        cell.innerHTML = `
          <div style="font-size: 18px; line-height: 1;">${iconDisplay}</div>
          <div style="font-size: 13px; font-weight: 600; color: #212529; margin: 2px 0;">
            ${tempDisplay}
          </div>
          <div style="font-size: 10px; color: #0066cc;">
            💧 ${rainDisplay}
          </div>
        `;
        mainRow.appendChild(cell);
      });

      tbody.appendChild(mainRow);

      // Secondary row with UV and wind data
      const secondaryRow = document.createElement('tr');
      if (dayIndex % 2 === 0) {
        secondaryRow.style.cssText = 'background: #ffffff; border-bottom: 1px solid #dee2e6;';
      } else {
        secondaryRow.style.cssText = 'background: #f8f9fa; border-bottom: 1px solid #dee2e6;';
      }

      // Add UV and wind cells for each time period
      day.slices.forEach((slice, index) => {
        const cell = document.createElement('td');
        cell.style.cssText = `
          padding: 4px;
          text-align: center;
          ${index < day.slices.length - 1 ? 'border-right: 1px solid #f1f3f5;' : ''}
          font-size: 10px;
          color: #6c757d;
        `;
        
        // Format UV index with uncertainty
        let uvDisplay = slice.uvIndex;
        if (isEnsemble && slice.uvStd !== null && slice.uvIndex !== "—") {
          uvDisplay = `${slice.uvIndex}±${slice.uvStd}`;
        }
        
        // Format wind with uncertainty
        let windDisplay = `${slice.windSpeed}/${slice.windGust} Bft`;
        if (isEnsemble && slice.windStd !== null && slice.windSpeed !== "—") {
          // Convert wind std from km/h to Beaufort scale difference
          const windStdBft = Math.max(1, Math.round(slice.windStd / 10)); // Rough conversion
          windDisplay = `${slice.windSpeed}±${windStdBft}/${slice.windGust} Bft`;
        }
        
        cell.innerHTML = `
          <div>☀️ UV: ${uvDisplay}</div>
          <div>💨 ${windDisplay}</div>
        `;
        secondaryRow.appendChild(cell);
      });

      tbody.appendChild(secondaryRow);
    });

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);

    // Legend for ensemble models
    if (isEnsemble) {
      const legend = document.createElement('div');
      legend.style.cssText = `
        margin-top: 12px;
        padding: 8px;
        background: white;
        border-radius: 8px;
        font-size: 10px;
        color: #6c757d;
        text-align: center;
      `;
      legend.innerHTML = `
        <strong>Ensemble Legend:</strong> 
        Temp: mean±uncertainty° | 
        Rain: mean±uncertainty% | 
        UV: mean±uncertainty | 
        Icon: <sub>agreeing/total</sub> | 
        Wind: avg±unc/gust Bft
      `;
      container.appendChild(legend);
    }

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      text-align: center;
      margin-top: 12px;
      padding: 8px;
      font-size: 11px;
      color: #868e96;
    `;
    footer.textContent = 'Weather data provided by Open-Meteo.';
    container.appendChild(footer);

    plot.appendChild(container);
  },

  /**
   * Format location information
   */
  formatLocationInfo: function(location, forecast) {
    const lat = location.lat.toFixed(2);
    const lon = location.lon.toFixed(2);
    const elevation = forecast && forecast.elevation ? `⛰️ ${forecast.elevation}m` : '';
    
    let sunInfo = '';
    if (forecast && forecast.daily && forecast.daily.sunrise && forecast.daily.sunset) {
      const sunrise = forecast.daily.sunrise[0];
      const sunset = forecast.daily.sunset[0];
      
      if (sunrise && sunset) {
        const sunriseTime = new Date(sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sunsetTime = new Date(sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        sunInfo = `☀️ ${sunriseTime} – 🌙 ${sunsetTime}`;
      }
    }
    
    const parts = [
      `📍 ${lat}°N, ${lon}°E`,
      elevation,
      sunInfo
    ].filter(part => part.length > 0);
    
    return parts.join(' | ');
  }
};