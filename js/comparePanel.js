/**
 * Compare Panel — overlays multiple weather models on one chart.
 * Parameters: Temperature (with weather icons), Rain, Wind, UV Index.
 * Model and parameter selection live inside the panel as toggle buttons.
 */
window.ComparePanel = {

  // ── Persistent state ────────────────────────────────────────────────────────
  selectedModelIds: ['bestmatch', 'meteoswiss_icon_ch1', 'meteoswiss_icon_ch2'],
  selectedParams:   ['symbols', 'temperature', 'rain', 'uv'],
  showAllModels:    false,
  showAllParams:    false,
  _symbolTraceIndices: [],

  // ── Constants ────────────────────────────────────────────────────────────────
  DEFAULT_MODEL_IDS: [
    'bestmatch',
    'icon_d2_det',
    'icon_eu_det',
    'meteoswiss_icon_ch1',
    'meteoswiss_icon_ch2',
    'arome_france_hd_det'
  ],
  DEFAULT_PARAM_IDS: [
    'symbols', 'temperature', 'rain', 'rain_prob', 'wind', 'wind_dir', 'uv'
  ],
  MODEL_COLORS: [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
    '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'
  ],
  PARAM_ORDER: [
    'symbols', 'temperature', 'rain', 'rain_prob', 'wind', 'wind_dir',
    'uv', 'humidity', 'dewpoint', 'cloud', 'visibility'
  ],
  PARAM_LABELS: {
    symbols:     '🌤️ Symbols',
    temperature: '🌡️ Temp',  rain: '🌧️ Rain',    rain_prob: '💧 Rain %',
    wind:        '💨 Wind',   wind_dir: '🧭 Dir',  uv: '☀️ UV',
    humidity:    '💦 Humidity', dewpoint: '🌫️ Dew Pt',
    cloud:       '☁️ Clouds',  visibility: '👁 Visibility',
  },
  PARAM_YAXIS_TITLE: {
    symbols:     'Symbols',
    temperature: 'Temp (°C)', rain: 'Precip (mm)', rain_prob: 'Rain prob (%)',
    wind:        'Wind (km/h)', wind_dir: 'Direction (°)', uv: 'UV Index',
    humidity:    'Humidity (%)', dewpoint: 'Dew point (°C)',
    cloud:       'Cloud cover (%)', visibility: 'Visibility (km)',
  },

  // ── Public entry point (called by VisRegistry) ──────────────────────────────
  render: function(data, location, model, config) {
    const plot = document.getElementById('plot');
    if (!plot) return;

    if (window.Plotly && plot.classList.contains('js-plotly-plot')) {
      try { Plotly.purge(plot); } catch (_) {}
    }
    plot.innerHTML = '';

    const { models: compareModels, allData } = data;

    // Controls strip at top of panel
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'compare-controls-bar';
    controlsDiv.style.cssText = [
      'padding:6px 8px',
      'display:flex',
      'flex-wrap:wrap',
      'gap:5px',
      'align-items:center',
      'border-bottom:1px solid #e0e0e0',
      'background:rgba(255,255,255,0.97)',
      'min-height:44px',
    ].join(';');
    plot.appendChild(controlsDiv);
    this.renderControls(controlsDiv);

    // Remainder is the Plotly chart
    const chartDiv = document.createElement('div');
    chartDiv.id = 'compare-chart';
    chartDiv.style.cssText = 'width:100%; height:calc(100% - 56px);';
    plot.appendChild(chartDiv);

    if (!compareModels || compareModels.length === 0) {
      chartDiv.innerHTML = '<div style="padding:24px;text-align:center;color:#888;font-size:14px;">Select at least one model above.</div>';
      return;
    }
    const orderedParams = this.PARAM_ORDER.filter(p => this.selectedParams.includes(p));
    if (orderedParams.length === 0) {
      chartDiv.innerHTML = '<div style="padding:24px;text-align:center;color:#888;font-size:14px;">Select at least one parameter above.</div>';
      return;
    }

    const colorMap = this._buildColorMap(compareModels.map(m => m.id));
    const traces   = this._buildTraces(compareModels, allData, orderedParams, colorMap);
    const layout   = this._buildLayout(compareModels, allData, orderedParams, colorMap, location);

    Plotly.newPlot('compare-chart', traces, layout, {
      responsive: true,
      displayModeBar: false,
      // Custom view buttons own the x-range; stop tap/double-tap from resetting it.
      doubleClick: false,
      scrollZoom: false
    }).then(() => {
      if (typeof window.applyActiveView === 'function') window.applyActiveView();
    });

    // Store time range on chartDiv so view buttons can relayout
    if (layout.xaxis && layout.xaxis.range) {
      chartDiv.setAttribute('data-start-time', layout.xaxis.range[0]);
      chartDiv.setAttribute('data-end-time',   layout.xaxis.range[1]);
    }
  },

  // ── Controls (model + param toggles) ────────────────────────────────────────
  renderControls: function(controlsDiv) {
    controlsDiv.innerHTML = '';
    const self = this;
    const allModels    = window.allModels || [];

    const label = (text) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.cssText = 'font-size:11px;font-weight:700;color:#555;white-space:nowrap;margin-right:2px;';
      return s;
    };

    const toggleBtn = (text, active, onClick) => {
      const btn = document.createElement('button');
      btn.className = 'compare-toggle-btn' + (active ? ' active' : '');
      btn.style.cssText = [
        'padding:3px 8px',
        'font-size:12px',
        'min-height:28px',
        'min-width:unset',
        'cursor:pointer',
        'border-radius:6px',
        'transition:all 0.15s ease',
        active ? 'border:1px solid #007AFF; background:#007AFF; color:white; font-weight:bold;' 
               : 'border:1px solid #ccc; background:white; color:#333;'
      ].join(';');
      btn.textContent = text;
      btn.addEventListener('click', onClick);
      return btn;
    };

    // Model toggles
    controlsDiv.appendChild(label('Models:'));

    allModels.filter(m =>
      self.showAllModels || self.selectedModelIds.includes(m.id) || self.DEFAULT_MODEL_IDS.includes(m.id)
    ).forEach(m => {
      controlsDiv.appendChild(toggleBtn(
        m.label,
        self.selectedModelIds.includes(m.id),
        () => {
          const idx = self.selectedModelIds.indexOf(m.id);
          if (idx >= 0) self.selectedModelIds.splice(idx, 1);
          else          self.selectedModelIds.push(m.id);
          if (window.fetchAndPlot) window.fetchAndPlot();
        }
      ));
    });

    controlsDiv.appendChild(toggleBtn(self.showAllModels ? '– Less' : '+ More', false, () => {
      self.showAllModels = !self.showAllModels;
      self.renderControls(controlsDiv);
    }));

    // Separator
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:22px;background:#ccc;margin:0 4px;align-self:center;';
    controlsDiv.appendChild(sep);

    // Parameter toggles
    controlsDiv.appendChild(label('Params:'));

    this.PARAM_ORDER.filter(p =>
      self.showAllParams || self.selectedParams.includes(p) || self.DEFAULT_PARAM_IDS.includes(p)
    ).forEach(param => {
      controlsDiv.appendChild(toggleBtn(
        self.PARAM_LABELS[param],
        self.selectedParams.includes(param),
        () => {
          const idx = self.selectedParams.indexOf(param);
          if (idx >= 0) self.selectedParams.splice(idx, 1);
          else {
            self.selectedParams.push(param);
            self.selectedParams.sort((a, b) =>
              self.PARAM_ORDER.indexOf(a) - self.PARAM_ORDER.indexOf(b));
          }
          if (window.fetchAndPlot) window.fetchAndPlot();
        }
      ));
    });

    controlsDiv.appendChild(toggleBtn(self.showAllParams ? '– Less' : '+ More', false, () => {
      self.showAllParams = !self.showAllParams;
      self.renderControls(controlsDiv);
    }));
  },

  // ── View range methods (called by main.js view buttons) ─────────────────────

  relayoutView: function(days) {
    const chartDiv = document.getElementById('compare-chart');
    if (!chartDiv || !chartDiv.classList.contains('js-plotly-plot')) return;
    const startTime = chartDiv.getAttribute('data-start-time');
    const endTime   = chartDiv.getAttribute('data-end-time');
    if (!startTime || !endTime) return;
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = new Date();
    const dataStart = new Date(startTime);
    const dataEnd   = new Date(endTime);
    const viewStart = new Date(Math.max(dataStart, now - msPerDay * 0.5));
    const viewEnd   = new Date(Math.min(dataEnd, viewStart.getTime() + days * msPerDay));
    const s = viewStart.toISOString().replace('Z', ''), e = viewEnd.toISOString().replace('Z', '');
    window._savedXRange = { start: s, end: e };
    Plotly.relayout('compare-chart', { 'xaxis.range': [s, e] });
    this._restyleSymbolSize(days);
  },

  viewAll: function() {
    const chartDiv = document.getElementById('compare-chart');
    if (!chartDiv || !chartDiv.classList.contains('js-plotly-plot')) return;
    const s = chartDiv.getAttribute('data-start-time');
    const e = chartDiv.getAttribute('data-end-time');
    if (s && e) {
      window._savedXRange = null;
      Plotly.relayout('compare-chart', { 'xaxis.range': [s, e] });
      this._restyleSymbolSize((new Date(e) - new Date(s)) / 86400000);
    }
  },

  viewOneDay: function() { this.relayoutView(1); },

  animateRange: function(newStart, newEnd) {
    const fmt = d => d.toISOString().replace('Z', '');
    window._savedXRange = { start: fmt(newStart), end: fmt(newEnd) };
    const chartDiv = document.getElementById('compare-chart');
    if (!chartDiv || !chartDiv.classList.contains('js-plotly-plot')) return;
    
    const layout = chartDiv.layout || chartDiv._fullLayout || {};
    const xaxis = layout.xaxis;
    if (!xaxis || !Array.isArray(xaxis.range)) return;
    
    const startFrom = new Date(xaxis.range[0]).getTime();
    const endFrom = new Date(xaxis.range[1]).getTime();
    const startTo = newStart.getTime();
    const endTo = newEnd.getTime();
    const duration = 600; // Matches duration of temperature panel transition (600ms)
    const startTime = performance.now();
    const formatTime = (date) => date.toISOString().replace('Z', '');
    
    if (chartDiv._currentPanAnimId) {
      cancelAnimationFrame(chartDiv._currentPanAnimId);
    }
    
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing: easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const curStart = startFrom + (startTo - startFrom) * ease;
      const curEnd = endFrom + (endTo - endFrom) * ease;
      
      Plotly.relayout('compare-chart', {
        'xaxis.range': [formatTime(new Date(curStart)), formatTime(new Date(curEnd))]
      });
      
      if (progress < 1) {
        chartDiv._currentPanAnimId = requestAnimationFrame(step);
      } else {
        delete chartDiv._currentPanAnimId;
      }
    };
    chartDiv._currentPanAnimId = requestAnimationFrame(step);
  },

  navigateTime: function(direction) {
    const chartDiv = document.getElementById('compare-chart');
    if (!chartDiv || !chartDiv.classList.contains('js-plotly-plot')) return;
    const layout = chartDiv.layout || chartDiv._fullLayout || {};
    const xaxis  = layout.xaxis;
    if (!xaxis || !Array.isArray(xaxis.range)) return;
    const start = new Date(xaxis.range[0]);
    const end   = new Date(xaxis.range[1]);
    const pan   = (end - start) * 0.75;
    let newStart = new Date(start.getTime() + (direction === 'right' ? pan : -pan));
    let newEnd   = new Date(end.getTime()   + (direction === 'right' ? pan : -pan));
    // Clamp to data boundaries
    const ds = chartDiv.getAttribute('data-start-time');
    const de = chartDiv.getAttribute('data-end-time');
    if (ds && newStart < new Date(ds)) {
      const off = new Date(ds) - newStart;
      newStart = new Date(ds);
      newEnd   = new Date(newEnd.getTime() + off);
    }
    if (de && newEnd > new Date(de)) {
      const off = newEnd - new Date(de);
      newEnd   = new Date(de);
      newStart = new Date(newStart.getTime() - off);
    }
    this.animateRange(newStart, newEnd);
  },

  _symbolSizeForDays: function(days) {
    if (days <= 1.5) return 45;
    if (days <= 2.5) return 30;
    if (days <= 5.5) return 26;
    return 18;
  },

  _restyleSymbolSize: function(days) {
    const indices = this._symbolTraceIndices;
    if (!indices || indices.length === 0) return;
    Plotly.restyle('compare-chart', { 'textfont.size': this._symbolSizeForDays(days) }, indices);
  },

  _buildColorMap: function(ids) {
    const map = {};
    ids.forEach((id, i) => { map[id] = this.MODEL_COLORS[i % this.MODEL_COLORS.length]; });
    return map;
  },

  // Compute equal-height row domains with a small gap between rows.
  // domains[0] = top row, domains[n-1] = bottom row.
  _getDomains: function(n) {
    if (n === 0) return [];
    const gap = 0.04;
    const h   = (1 - gap * (n - 1)) / n;
    const domains = [];
    for (let i = 0; i < n; i++) {
      const bottom = +((i * (h + gap)).toFixed(3));
      domains.push([bottom, +(bottom + h).toFixed(3)]);
    }
    return domains.reverse();
  },

  _buildTraces: function(compareModels, allData, orderedParams, colorMap) {
    const traces = [];
    this._symbolTraceIndices = [];

    let traceStart = null, traceEnd = null;
    allData.forEach(d => {
      const t = (d.forecast && d.forecast.hourly && d.forecast.hourly.time) || [];
      if (t.length) {
        if (!traceStart || t[0] < traceStart)             traceStart = t[0];
        if (!traceEnd   || t[t.length - 1] > traceEnd)   traceEnd   = t[t.length - 1];
      }
    });
    const initialDays = (traceStart && traceEnd)
      ? (new Date(traceEnd) - new Date(traceStart)) / 86400000
      : 7;
    const symbolSize = this._symbolSizeForDays(initialDays);

    // Helper to format metadata run times
    const formatInitTime = (window.WeatherAPI && window.WeatherAPI.formatInitTime) 
      ? window.WeatherAPI.formatInitTime 
      : function(unixTime) {
          if (!unixTime) return "";
          const d = new Date(unixTime * 1000);
          const pad = n => String(n).padStart(2, '0');
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
        };

    orderedParams.forEach((param, rowIdx) => {
      // y1 is 'y' in Plotly; subsequent axes are y2, y3, …
      const yaxis = rowIdx === 0 ? 'y' : `y${rowIdx + 1}`;

      compareModels.forEach((model, modelIdx) => {
        const hourly = allData[modelIdx].forecast.hourly;
        const times  = hourly.time || [];
        const color  = colorMap[model.id] || this.MODEL_COLORS[modelIdx % this.MODEL_COLORS.length];
        const showlegend = (rowIdx === 0); // one legend entry per model

        let displayName = model.label;
        if (allData[modelIdx].forecast.model_metadata && allData[modelIdx].forecast.model_metadata.last_run_initialisation_time) {
          const unixTime = allData[modelIdx].forecast.model_metadata.last_run_initialisation_time;
          displayName = `${model.label} (${formatInitTime(unixTime)})`;
        }

        if (param === 'symbols') {
          if (window.WeatherIcons && (hourly.weather_code || []).some(c => c != null)) {
            const icons  = window.WeatherIcons.getIcons(hourly.weather_code || []);
            const nModels = compareModels.length;
            const top = 0.85;
            const bottom = 0.15;
            const yVal = nModels === 1
              ? 0.5
              : top - (modelIdx / (nModels - 1)) * (top - bottom);

            // Horizontal guide line behind weather symbols (fainter color-coded dashed line)
            traces.push({
              x: times,
              y: times.map(() => yVal),
              mode: 'lines',
              line: { color: color + '40', width: 1, dash: 'dash' },
              name: `${displayName} guide`,
              legendgroup: model.id,
              showlegend: false,
              hoverinfo: 'none',
              yaxis
            });

            this._symbolTraceIndices.push(traces.length);
            traces.push({
              x: times,
              y: times.map(() => yVal),
              mode: 'text',
              text: icons,
              textfont: { size: symbolSize },
              name: `${displayName} icons`,
              legendgroup: model.id,
              showlegend: false,
              hovertext: times.map((t, idx) => {
                const iconSymbol = icons[idx] || '';
                return `${displayName}: ${iconSymbol}`;
              }),
              hoverinfo: 'text',
              yaxis
            });
          }
        }

        if (param === 'temperature') {
          const temp = hourly.temperature_2m || [];
          traces.push({
            x: times, y: temp,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend,
            line: { color, width: 2 },
            yaxis
          });
        }

        if (param === 'rain') {
          const precip = (hourly.precipitation || []).map(p => Math.max(0, p || 0));
          traces.push({
            x: times, y: precip,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            fill: 'tozeroy',
            fillcolor: color + '28',
            yaxis
          });
        }

        if (param === 'rain_prob') {
          const prob = hourly.precipitation_probability || [];
          traces.push({
            x: times, y: prob,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2, dash: 'dot' },
            fill: 'tozeroy',
            fillcolor: color + '22',
            yaxis
          });
        }

        if (param === 'wind') {
          const speed = hourly.wind_speed_10m || [];
          const gusts = hourly.wind_gusts_10m || [];
          traces.push({
            x: times, y: speed,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            yaxis
          });
          if (gusts.some(g => g != null && g > 0)) {
            traces.push({
              x: times, y: gusts,
              mode: 'lines',
              name: `${displayName} gusts`,
              legendgroup: model.id,
              showlegend: false,
              line: { color, width: 1, dash: 'dash' },
              yaxis
            });
          }
        }

        if (param === 'wind_dir') {
          const dir = hourly.wind_direction_10m || [];
          traces.push({
            x: times, y: dir,
            mode: 'markers',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            marker: { color, size: 3 },
            yaxis
          });
        }

        if (param === 'uv') {
          const uv = hourly.uv_index || [];
          traces.push({
            x: times, y: uv,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            yaxis
          });
        }

        if (param === 'humidity') {
          const hum = hourly.relative_humidity_2m || [];
          traces.push({
            x: times, y: hum,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            yaxis
          });
        }

        if (param === 'dewpoint') {
          const dp = hourly.dew_point_2m || [];
          traces.push({
            x: times, y: dp,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            yaxis
          });
        }

        if (param === 'cloud') {
          const cc = hourly.cloud_cover || [];
          traces.push({
            x: times, y: cc,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            fill: 'tozeroy',
            fillcolor: color + '18',
            yaxis
          });
        }

        if (param === 'visibility') {
          const vis = (hourly.visibility || []).map(v => v != null ? v / 1000 : null);
          traces.push({
            x: times, y: vis,
            mode: 'lines',
            name: displayName,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            yaxis
          });
        }
      });
    });

    return traces;
  },

  _buildLayout: function(compareModels, allData, orderedParams, colorMap, location) {
    const n       = orderedParams.length;
    const domains = this._getDomains(n);

    // x-range: span all models
    let startTime = null, endTime = null;
    allData.forEach(d => {
      const t = (d.forecast && d.forecast.hourly && d.forecast.hourly.time) || [];
      if (t.length) {
        if (!startTime || t[0] < startTime)              startTime = t[0];
        if (!endTime   || t[t.length - 1] > endTime)    endTime   = t[t.length - 1];
      }
    });

    const nightShading       = this._buildNightShading(allData[0], startTime, endTime);
    const nowLine            = this._buildNowLine();
    const weekdayAnnotations = this._buildWeekdayAnnotations(
      (allData[0].forecast && allData[0].forecast.hourly && allData[0].forecast.hourly.time) || []
    );

    // Build yaxis entries dynamically
    const yaxisConfig = {};
    orderedParams.forEach((param, i) => {
      const key = i === 0 ? 'yaxis' : `yaxis${i + 1}`;
      const extra = {};
      if (param === 'symbols')   { extra.range = [0, 1]; extra.visible = false; }
      if (param === 'uv')        extra.range = [0, 12];
      if (param === 'rain')      extra.rangemode = 'tozero';
      if (param === 'rain_prob') { extra.rangemode = 'tozero'; extra.range = [0, 100]; }
      if (param === 'wind')      extra.rangemode = 'tozero';
      if (param === 'wind_dir')  { extra.range = [0, 360]; extra.tickvals = [0, 90, 180, 270, 360]; extra.ticktext = ['N', 'E', 'S', 'W', 'N']; }
      if (param === 'humidity')  { extra.rangemode = 'tozero'; extra.range = [0, 100]; }
      if (param === 'cloud')     { extra.rangemode = 'tozero'; extra.range = [0, 100]; }
      if (param === 'visibility') extra.rangemode = 'tozero';
      yaxisConfig[key] = {
        title:     this.PARAM_YAXIS_TITLE[param],
        domain:    domains[i],
        anchor:    'x',
        autorange: !extra.range,
        showgrid:  param !== 'symbols',
        gridcolor: '#f0f0f0',
        zeroline:  (param === 'rain' || param === 'uv' || param === 'rain_prob'),
        ...extra,
      };
    });

    // xaxis anchors to bottom row
    const bottomRef = n === 1 ? 'y' : `y${n}`;

    // Build legend badges for weather icon rows (if symbols is selected)
    const iconAnnotations = [];
    const symbolsIdx = orderedParams.indexOf('symbols');
    if (symbolsIdx >= 0) {
      const symbolsDomain = domains[symbolsIdx];
      const domainHeight = symbolsDomain[1] - symbolsDomain[0];
      
      compareModels.forEach((model, modelIdx) => {
        const nModels = compareModels.length;
        const top = 0.85;
        const bottom = 0.15;
        const yVal = nModels === 1
          ? 0.5
          : top - (modelIdx / (nModels - 1)) * (top - bottom);
          
        // Map to paper coordinate
        const yp = symbolsDomain[0] + yVal * domainHeight;
        const color = colorMap[model.id] || '#333';
        
        iconAnnotations.push({
          x: 0.005,
          y: yp,
          xref: 'paper',
          yref: 'paper',
          text: `<b>${model.label}</b>`,
          showarrow: false,
          xanchor: 'left',
          yanchor: 'middle',
          font: { size: 9, color: color },
          bordercolor: color + '40',
          borderwidth: 1,
          borderpad: 2,
          bgcolor: 'rgba(255, 255, 255, 0.9)',
        });
      });
    }

    const allAnnotations = [...weekdayAnnotations, ...iconAnnotations];

    return {
      width:  window.innerWidth,
      height: Math.max(window.innerHeight - 150, 120 + n * 130),
      title:  {
        text: `🔀 Compare — ${location ? location.name : ''}`,
        x: 0.05, font: { size: 12 }
      },
      xaxis: {
        tickformat:   '%b %d %H:%M',
        tickangle:    -30,
        showgrid:     true,
        gridcolor:    '#f0f0f0',
        rangeslider:  { visible: false },
        range:        [startTime, endTime],
        anchor:       bottomRef,
      },
      ...yaxisConfig,
      shapes:      [...nightShading, nowLine],
      showlegend:  true,
      legend: {
        x: 0.99, y: 0.99,
        xanchor:     'right',
        yanchor:     'top',
        bgcolor:     'rgba(255, 255, 255, 0.6)',
        bordercolor: '#ccc',
        borderwidth: 1,
        font:        { size: 11 },
        orientation: 'v',
      },
      annotations: allAnnotations,
      margin:      { l: 60, r: 50, t: 30, b: 55 },
      dragmode:      false,
      plot_bgcolor:  'white',
      paper_bgcolor: 'white',
    };
  },

  // Verbatim port of the night-shading algorithm from plot.js lines 300-349
  _buildNightShading: function(firstData, startTime, endTime) {
    const shapes = [];
    if (!firstData || !firstData.forecast || !firstData.forecast.daily) return shapes;

    const sunrises = (firstData.forecast.daily.sunrise || []).map(s => new Date(s));
    const sunsets  = (firstData.forecast.daily.sunset  || []).map(s => new Date(s));
    if (sunrises.length === 0 || sunsets.length === 0) return shapes;

    const dataStartDate = new Date(startTime);
    const dataEndDate   = new Date(endTime);
    if (isNaN(dataStartDate.getTime()) || isNaN(dataEndDate.getTime())) return shapes;

    const addSeg = (segStart, segEnd) => {
      if (!segStart || !segEnd) return;
      const s = segStart instanceof Date ? segStart : new Date(segStart);
      const e = segEnd   instanceof Date ? segEnd   : new Date(segEnd);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
      const cs = new Date(Math.max(s.getTime(), dataStartDate.getTime()));
      const ce = new Date(Math.min(e.getTime(), dataEndDate.getTime()));
      if (ce <= cs) return;
      shapes.push({
        type: 'rect', xref: 'x', yref: 'paper',
        x0: cs, x1: ce, y0: 0, y1: 1,
        fillcolor: 'rgba(0,0,0,0.08)', layer: 'below', line: { width: 0 }
      });
    };

    if (sunrises.length > 0 && dataStartDate < sunrises[0]) addSeg(dataStartDate, sunrises[0]);

    const paired = Math.min(sunsets.length, Math.max(0, sunrises.length - 1));
    for (let i = 0; i < paired; i++) addSeg(sunsets[i], sunrises[i + 1]);

    if (sunsets.length > paired) {
      addSeg(sunsets[sunsets.length - 1], dataEndDate);
    } else if (paired > 0 && !sunrises[paired]) {
      addSeg(sunsets[paired - 1], dataEndDate);
    }

    return shapes;
  },

  _buildNowLine: function() {
    const iso = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
    return {
      type: 'line', x0: iso, x1: iso, y0: 0, y1: 1,
      xref: 'x', yref: 'paper',
      line: { color: 'rgba(255,0,0,0.7)', dash: 'dash', width: 2 }
    };
  },

  _buildWeekdayAnnotations: function(times) {
    const uniqueDays = [...new Set(times.map(t => t.split('T')[0]))];
    return uniqueDays.map(day => {
      const d = new Date(`${day}T12:00:00`);
      return {
        x: `${day}T12:00`, y: 1.02,
        xref: 'x', yref: 'paper',
        text: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        showarrow: false,
        font: { size: 11, color: '#555' },
        align: 'center'
      };
    });
  },
};
