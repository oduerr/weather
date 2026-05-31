/**
 * Compare Panel — overlays multiple weather models on one chart.
 * Parameters: Temperature (with weather icons), Rain, Wind, UV Index.
 * Model and parameter selection live inside the panel as toggle buttons.
 */
window.ComparePanel = {

  // ── Persistent state ────────────────────────────────────────────────────────
  selectedModelIds: ['bestmatch', 'icon_d2_det', 'meteoswiss_icon_ch2'],
  selectedParams:   ['temperature', 'rain', 'wind', 'uv'],

  // ── Constants ────────────────────────────────────────────────────────────────
  MODEL_COLORS: [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
    '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'
  ],
  PARAM_ORDER:       ['temperature', 'rain', 'wind', 'uv'],
  PARAM_LABELS:      { temperature: '🌡️ Temp', rain: '🌧️ Rain', wind: '💨 Wind', uv: '☀️ UV' },
  PARAM_YAXIS_TITLE: { temperature: 'Temp (°C)', rain: 'Precip (mm)', wind: 'Wind (km/h)', uv: 'UV Index' },

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
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d']
    });
  },

  // ── Controls (model + param toggles) ────────────────────────────────────────
  renderControls: function(controlsDiv) {
    controlsDiv.innerHTML = '';
    const self = this;
    const allModels    = window.allModels || [];
    const hasGoogleKey = !!localStorage.getItem('googleApiKey');

    const label = (text) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.cssText = 'font-size:11px;font-weight:700;color:#555;white-space:nowrap;margin-right:2px;';
      return s;
    };

    const toggleBtn = (text, active, onClick) => {
      const btn = document.createElement('button');
      btn.className = 'view-btn' + (active ? ' active' : '');
      btn.style.cssText = 'padding:3px 8px;font-size:12px;min-height:28px;min-width:unset;';
      btn.textContent = text;
      btn.addEventListener('click', onClick);
      return btn;
    };

    // Model toggles
    controlsDiv.appendChild(label('Models:'));
    allModels.forEach(m => {
      if (m.id === 'google_metnet' && !hasGoogleKey) return;
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

    // Separator
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:22px;background:#ccc;margin:0 4px;align-self:center;';
    controlsDiv.appendChild(sep);

    // Parameter toggles
    controlsDiv.appendChild(label('Params:'));
    this.PARAM_ORDER.forEach(param => {
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
  },

  // ── Internals ────────────────────────────────────────────────────────────────

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

    orderedParams.forEach((param, rowIdx) => {
      // y1 is 'y' in Plotly; subsequent axes are y2, y3, …
      const yaxis = rowIdx === 0 ? 'y' : `y${rowIdx + 1}`;

      compareModels.forEach((model, modelIdx) => {
        const hourly = allData[modelIdx].forecast.hourly;
        const times  = hourly.time || [];
        const color  = colorMap[model.id] || this.MODEL_COLORS[modelIdx % this.MODEL_COLORS.length];
        const showlegend = (rowIdx === 0); // one legend entry per model

        if (param === 'temperature') {
          const temp = hourly.temperature_2m || [];
          traces.push({
            x: times, y: temp,
            mode: 'lines',
            name: model.label,
            legendgroup: model.id,
            showlegend,
            line: { color, width: 2 },
            yaxis
          });

          // Weather icons: first selected model only
          if (modelIdx === 0 && window.WeatherIcons) {
            const icons = window.WeatherIcons.getIcons(hourly.weather_code || []);
            traces.push({
              x: times,
              y: temp.map(t => (t || 0) + 1.5),
              mode: 'text',
              text: icons,
              textfont: { size: 13 },
              name: 'Weather',
              legendgroup: model.id,
              showlegend: false,
              hoverinfo: 'text',
              yaxis
            });
          }
        }

        if (param === 'rain') {
          const precip     = (hourly.precipitation || []).map(p => Math.max(0, p || 0));
          const precipProb = hourly.precipitation_probability || [];

          // Filled line per model
          traces.push({
            x: times, y: precip,
            mode: 'lines',
            name: model.label,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            fill: 'tozeroy',
            fillcolor: color + '28', // ~16% opacity fill
            yaxis
          });

          // Rain probability dashed for first model only (avoids clutter)
          if (modelIdx === 0 && precipProb.length > 0) {
            const yProb = rowIdx === 0 ? 'y2' : `y${rowIdx + 2}`;
            traces.push({
              x: times, y: precipProb,
              mode: 'lines',
              name: 'Rain prob. (%)',
              legendgroup: 'rainprob',
              showlegend: (rowIdx === orderedParams.indexOf('rain')),
              line: { color: '#87CEEB', width: 1, dash: 'dot' },
              fill: 'tozeroy',
              fillcolor: 'rgba(135,206,235,0.10)',
              yaxis: `y${orderedParams.length + 1}` // extra axis beyond the param rows
            });
          }
        }

        if (param === 'wind') {
          const speed = hourly.wind_speed_10m  || [];
          const gusts = hourly.wind_gusts_10m  || [];
          traces.push({
            x: times, y: speed,
            mode: 'lines',
            name: model.label,
            legendgroup: model.id,
            showlegend: false,
            line: { color, width: 2 },
            yaxis
          });
          // Wind gusts as thinner dashed line in same colour
          if (gusts.some(g => g != null && g > 0)) {
            traces.push({
              x: times, y: gusts,
              mode: 'lines',
              name: `${model.label} gusts`,
              legendgroup: model.id,
              showlegend: false,
              line: { color, width: 1, dash: 'dash' },
              yaxis
            });
          }
        }

        if (param === 'uv') {
          const uv = hourly.uv_index || [];
          traces.push({
            x: times, y: uv,
            mode: 'lines',
            name: model.label,
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
      yaxisConfig[key] = {
        title:     this.PARAM_YAXIS_TITLE[param],
        domain:    domains[i],
        autorange: true,
        showgrid:  true,
        gridcolor: '#f0f0f0',
        zeroline:  (param === 'rain' || param === 'uv'),
        ...(param === 'uv'   ? { range: [0, 12] } : {}),
        ...(param === 'rain' ? { rangemode: 'tozero' } : {}),
        ...(param === 'wind' ? { rangemode: 'tozero' } : {}),
      };
    });

    // Extra axis for rain probability (overlays rain row)
    const rainIdx = orderedParams.indexOf('rain');
    if (rainIdx >= 0) {
      const probAxisKey = `yaxis${orderedParams.length + 1}`;
      const rainAxisRef = rainIdx === 0 ? 'y' : `y${rainIdx + 1}`;
      yaxisConfig[probAxisKey] = {
        title:      'Rain prob. (%)',
        overlaying: rainAxisRef,
        side:       'right',
        range:      [0, 100],
        showgrid:   false,
        color:      '#87CEEB',
      };
    }

    // xaxis anchors to bottom row
    const bottomRef = n === 1 ? 'y' : `y${n}`;

    return {
      width:  window.innerWidth,
      height: Math.max(window.innerHeight - 150, 350),
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
        x: 0.01, y: 1.0,
        bgcolor:     'rgba(255,255,255,0.85)',
        bordercolor: '#ccc',
        borderwidth: 1,
        font:        { size: 11 },
        orientation: 'h',
      },
      annotations: weekdayAnnotations,
      margin:      { l: 60, r: 60, t: 30, b: 55 },
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
