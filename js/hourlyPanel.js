/**
 * Hourly Panel — mobile-friendly swipeable tiles
 *
 * Vertical list of days; each day is a horizontally scroll-snapping row of compact
 * tiles. By default tiles are spaced every 3 hours (uniform for all days); tapping
 * a tile expands that 3-hour block into its individual hours (and tapping again,
 * or tapping an expanded hour, collapses it).
 *
 * Each tile shows: hour, weather symbol, temperature, UV, wind (speed + direction),
 * and precipitation (probability + amount as a bar).
 *
 * Polish for time-orientation & at-a-glance feel:
 *  - Day/night tinting via hourly `is_day` (falls back to sunrise/sunset comparison).
 *  - Sunrise/sunset marker tiles inserted into the strip at the right hour.
 *  - Temperature values coloured on a blue→red scale.
 *  - Precipitation drawn as a vertical bar (height ∝ amount).
 *
 * No Plotly — pure DOM under #plot (same pattern as the actuals panel).
 *
 * Signature: render(data, location, model, config)
 */
window.HourlyPanel = (function () {
  const STEP_H = 3;                 // default tile spacing (hours)
  const expanded = new Set();       // keys "YYYY-MM-DD-<blockIndex>" currently drilled-in
  let lastRender = null;            // args of the last render(), for re-rendering on toggle

  // Same convention as plot.js: arrow points where the wind is coming FROM.
  function windDirToArrow(deg) {
    if (deg == null || Number.isNaN(deg)) return '';
    const d = ((deg % 360) + 360) % 360;
    if (d < 22.5 || d >= 337.5) return '↑';
    if (d < 67.5) return '↗';
    if (d < 112.5) return '→';
    if (d < 157.5) return '↘';
    if (d < 202.5) return '↓';
    if (d < 247.5) return '↙';
    if (d < 292.5) return '←';
    return '↖';
  }

  function icon(code) {
    return (window.WeatherIcons && window.WeatherIcons.getIcon)
      ? window.WeatherIcons.getIcon(code)
      : '·';
  }

  // API requests timezone=Europe/Berlin, so hourly.time strings are already
  // local wall-clock ISO without offset (e.g. "2026-06-28T14:00").
  function berlinNow() {
    const s = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
    return new Date(s);
  }

  function round(v, digits = 0) {
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    const p = Math.pow(10, digits);
    return Math.round(v * p) / p;
  }

  // Temperature → colour on a blue (cold) → red (hot) scale.
  function tempColor(t, isDay) {
    if (t == null) return isDay ? '#222' : '#eee';
    const clamped = Math.max(-10, Math.min(35, t));
    const frac = (clamped + 10) / 45;        // 0 (cold) … 1 (hot)
    const hue = 210 * (1 - frac);            // 210° blue → 0° red
    const light = isDay ? 42 : 64;
    return `hsl(${Math.round(hue)}, 80%, ${light}%)`;
  }

  function dayLabel(dateStr, todayStr, tomorrowStr) {
    const d = new Date(dateStr + 'T12:00');
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dm = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    if (dateStr === todayStr) return `Today · ${weekday} ${dm}`;
    if (dateStr === tomorrowStr) return `Tomorrow · ${weekday} ${dm}`;
    return `${weekday} ${dm}`;
  }

  // Vertical precipitation bar whose height encodes the amount (~4 mm fills it).
  function precipBar(amount, isDay) {
    const track = document.createElement('div');
    track.style.cssText = 'height:22px;display:flex;align-items:flex-end;justify-content:center;';
    if (amount != null && amount > 0) {
      const h = Math.max(3, Math.min(22, (amount / 4) * 22));
      const bar = document.createElement('div');
      bar.style.cssText = `width:10px;height:${h}px;border-radius:2px 2px 0 0;background:${isDay ? '#0a7cd1' : '#4ea8ff'};`;
      track.appendChild(bar);
    }
    return track;
  }

  // Build an hour tile. `expandable` = collapsed 3h tile (shows "⋯" open hint);
  // `expandedMember` = part of an open block (shows "▴" collapse hint).
  function buildHourTile(h, expandable, expandedMember) {
    const isDay = h.isDay !== 0; // treat unknown as day
    const tile = document.createElement('div');
    const bg = h.isNow
      ? (isDay ? '#eaf3ff' : '#33406b')
      : (isDay ? '#f7f8fb' : '#2b3050');
    tile.style.cssText = [
      'flex:0 0 auto', 'scroll-snap-align:start', 'width:64px',
      'box-sizing:border-box', 'padding:8px 4px', 'border-radius:12px',
      'text-align:center', 'background:' + bg, 'cursor:pointer',
      'border:' + (h.isNow ? '1.5px solid #007AFF' : '1px solid ' + (isDay ? '#ececf0' : '#3a4166')),
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:2px'
    ].join(';');

    const subColor = isDay ? '#555' : '#c2c8e8';

    const hour = document.createElement('div');
    hour.textContent = h.isNow ? 'Now' : h.hour;
    hour.style.cssText = 'font-size:12px;font-weight:600;color:' +
      (h.isNow ? (isDay ? '#007AFF' : '#8fb6ff') : subColor);

    const sym = document.createElement('div');
    sym.textContent = icon(h.code);
    sym.style.cssText = 'font-size:22px;line-height:1.1';

    const temp = document.createElement('div');
    temp.textContent = h.temp != null ? `${h.temp}°` : '–';
    temp.style.cssText = `font-size:16px;font-weight:700;color:${tempColor(h.temp, isDay)}`;

    const uv = document.createElement('div');
    if (h.uv != null && h.uv >= 0.5) {
      uv.textContent = `☀️${h.uv}`;
      uv.style.cssText = `font-size:11px;color:${isDay ? '#c47f00' : '#ffce6b'}`;
    } else {
      uv.innerHTML = '&nbsp;';
      uv.style.cssText = 'font-size:11px';
    }

    const wind = document.createElement('div');
    wind.textContent = h.wind != null ? `${h.wind}${h.arrow}` : '';
    wind.style.cssText = `font-size:11px;color:${subColor};white-space:nowrap`;
    wind.title = 'Wind km/h (gust ' + (h.gust != null ? h.gust : '?') + ')';

    const precip = document.createElement('div');
    precip.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px;min-height:42px;justify-content:flex-end;';
    const prob = document.createElement('div');
    prob.style.cssText = `font-size:11px;font-weight:600;color:${isDay ? '#0a7cd1' : '#7cc0ff'}`;
    prob.innerHTML = (h.pop != null && h.pop > 0) ? `💧${h.pop}%` : '&nbsp;';
    const mm = document.createElement('div');
    mm.style.cssText = `font-size:9px;color:${isDay ? '#0a7cd1' : '#7cc0ff'}`;
    mm.innerHTML = (h.precip != null && h.precip > 0) ? `${h.precip}mm` : '&nbsp;';
    precip.appendChild(prob);
    precip.appendChild(precipBar(h.precip, isDay));
    precip.appendChild(mm);

    // Affordance: "⋯" = tap to expand (collapsed 3h tile), "▴" = tap to collapse.
    const hint = document.createElement('div');
    hint.style.cssText = `font-size:11px;line-height:1;height:12px;color:${isDay ? '#9aa' : '#7e86ad'}`;
    hint.textContent = expandable ? '⋯' : (expandedMember ? '▴' : '');

    tile.appendChild(hour);
    tile.appendChild(sym);
    tile.appendChild(temp);
    tile.appendChild(uv);
    tile.appendChild(wind);
    tile.appendChild(precip);
    tile.appendChild(hint);
    return tile;
  }

  function buildMarkerTile(m) {
    const tile = document.createElement('div');
    const sunrise = m.marker === 'sunrise';
    tile.style.cssText = [
      'flex:0 0 auto', 'scroll-snap-align:start', 'width:54px',
      'box-sizing:border-box', 'padding:8px 4px', 'border-radius:12px',
      'text-align:center', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'gap:4px',
      'background:' + (sunrise
        ? 'linear-gradient(180deg,#fff4d6,#ffe9c2)'
        : 'linear-gradient(180deg,#ffe0c2,#e9c7e8)'),
      'border:1px dashed ' + (sunrise ? '#e0b341' : '#c98fb0')
    ].join(';');

    const emo = document.createElement('div');
    emo.textContent = sunrise ? '🌅' : '🌇';
    emo.style.cssText = 'font-size:24px;line-height:1';
    const lbl = document.createElement('div');
    lbl.textContent = sunrise ? 'Sunrise' : 'Sunset';
    lbl.style.cssText = 'font-size:9px;color:#7a5a2a;font-weight:600;text-transform:uppercase;letter-spacing:.3px';
    const time = document.createElement('div');
    time.textContent = m.time;
    time.style.cssText = 'font-size:12px;font-weight:700;color:#5a3f1e';

    tile.appendChild(emo);
    tile.appendChild(lbl);
    tile.appendChild(time);
    return tile;
  }

  function hhmm(d) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function blockKey(dateStr, hourOfDay) {
    return `${dateStr}-${Math.floor(hourOfDay / STEP_H)}`;
  }

  // Toggle a 3h block open/closed and re-render in place (keeping scroll position).
  function toggleBlock(key) {
    if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
    if (!lastRender) return;
    const plot = document.getElementById('plot');
    const st = plot ? plot.scrollTop : 0;
    const sls = plot ? Array.from(plot.querySelectorAll('[data-row-date]')).map(r => [r.getAttribute('data-row-date'), r.scrollLeft]) : [];
    render(lastRender.data, lastRender.location, lastRender.model, lastRender.config);
    if (plot) {
      plot.scrollTop = st;
      sls.forEach(([d, x]) => {
        const r = plot.querySelector(`[data-row-date="${d}"]`);
        if (r) r.scrollLeft = x;
      });
    }
  }

  function render(data, location, model, config = {}) {
    lastRender = { data, location, model, config };
    const plot = document.getElementById('plot');
    if (!plot) return;

    if (window.Plotly && plot.classList && plot.classList.contains('js-plotly-plot')) {
      try { Plotly.purge(plot); } catch (_) {}
    }
    plot.innerHTML = '';

    const forecast = data && data.forecast ? data.forecast : null;
    const hourly = forecast && forecast.hourly ? forecast.hourly : null;
    if (!hourly || !hourly.time || hourly.time.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'padding:24px;text-align:center;color:#888;';
      msg.textContent = 'No hourly forecast data available.';
      plot.appendChild(msg);
      return;
    }

    const now = berlinNow();
    const todayStr = now.toLocaleDateString('sv-SE');
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('sv-SE');
    const currentHourStart = new Date(now); currentHourStart.setMinutes(0, 0, 0);

    const T = hourly.time;
    const temp = hourly.temperature_2m || [];
    const code = hourly.weather_code || [];
    const uv = hourly.uv_index || [];
    const wind = hourly.wind_speed_10m || [];
    const gust = hourly.wind_gusts_10m || [];
    const dir = hourly.wind_direction_10m || [];
    const precip = hourly.precipitation || [];
    const pop = hourly.precipitation_probability || [];
    const isDayArr = hourly.is_day || [];

    const daily = forecast.daily || {};
    const sunriseByDate = {}, sunsetByDate = {};
    if (daily.time && daily.sunrise && daily.sunset) {
      daily.time.forEach((d, i) => {
        if (daily.sunrise[i]) sunriseByDate[d] = new Date(daily.sunrise[i]);
        if (daily.sunset[i]) sunsetByDate[d] = new Date(daily.sunset[i]);
      });
    }

    // Build full per-hour records from the current hour onward, grouped by day.
    const days = [];
    let lastDate = null;
    let nowMarked = false;
    for (let i = 0; i < T.length; i++) {
      const t = new Date(T[i]);
      if (t < currentHourStart) continue;
      const dateStr = T[i].slice(0, 10);
      if (dateStr !== lastDate) { days.push({ dateStr, hours: [] }); lastDate = dateStr; }

      const isNow = !nowMarked; if (isNow) nowMarked = true;

      let isDayVal = isDayArr.length ? isDayArr[i] : null;
      if (isDayVal == null) {
        const sr = sunriseByDate[dateStr], ss = sunsetByDate[dateStr];
        isDayVal = (sr && ss) ? (t >= sr && t < ss ? 1 : 0) : 1;
      }

      days[days.length - 1].hours.push({
        hour: T[i].slice(11, 16),
        t,
        isNow,
        isDay: isDayVal,
        temp: round(temp[i]),
        code: code[i],
        uv: round(uv[i], 1),
        wind: round(wind[i]),
        gust: round(gust[i]),
        arrow: windDirToArrow(dir[i]),
        precip: round(precip[i], 1),
        pop: round(pop[i])
      });
    }

    const container = document.createElement('div');
    container.style.cssText = 'padding:8px 0 24px;max-width:1100px;margin:0 auto;';

    const title = document.createElement('div');
    title.style.cssText = 'padding:6px 12px 2px;font-size:13px;color:#888;';
    title.textContent = `${location && location.name ? location.name : ''} — hourly · tap a tile to expand` +
      (model && model.label ? ` · ${model.label}` : '');
    container.appendChild(title);

    days.forEach(day => {
      const header = document.createElement('div');
      header.setAttribute('data-date', day.dateStr);
      header.textContent = dayLabel(day.dateStr, todayStr, tomorrowStr);
      header.style.cssText = [
        'position:sticky', 'left:0', 'padding:10px 12px 4px',
        'font-size:14px', 'font-weight:700', 'color:#333',
        'background:rgba(255,255,255,0.95)'
      ].join(';');
      container.appendChild(header);

      // Group the day's hours into STEP_H blocks; show one tile per block unless
      // the block is expanded, in which case show every hour in it.
      const items = [];
      let curKey = null;
      day.hours.forEach(h => {
        const key = blockKey(day.dateStr, h.t.getHours());
        if (expanded.has(key)) {
          items.push({ kind: 'hour', t: h.t, h, key });
        } else if (key !== curKey) {
          items.push({ kind: 'block', t: h.t, h, key }); // representative = first hour of block
          curKey = key;
        }
      });

      // Sunrise/sunset markers within the shown window.
      const firstT = day.hours[0] ? day.hours[0].t : null;
      const lastT = day.hours[day.hours.length - 1] ? day.hours[day.hours.length - 1].t : null;
      const sr = sunriseByDate[day.dateStr], ss = sunsetByDate[day.dateStr];
      if (sr && firstT && sr >= firstT && sr <= lastT) items.push({ kind: 'marker', t: sr, marker: { marker: 'sunrise', time: hhmm(sr) } });
      if (ss && firstT && ss >= firstT && ss <= lastT) items.push({ kind: 'marker', t: ss, marker: { marker: 'sunset', time: hhmm(ss) } });
      items.sort((a, b) => a.t - b.t);

      const row = document.createElement('div');
      row.setAttribute('data-row-date', day.dateStr);
      row.style.cssText = [
        'display:flex', 'gap:6px', 'overflow-x:auto', 'scroll-snap-type:x mandatory',
        'padding:4px 12px 8px', '-webkit-overflow-scrolling:touch'
      ].join(';');
      // Render items; consecutive expanded hours of the same block are wrapped in
      // a symmetric, tinted "expanded" group box so the drill-in reads clearly.
      let j = 0;
      while (j < items.length) {
        const it = items[j];
        if (it.kind === 'marker') { row.appendChild(buildMarkerTile(it.marker)); j++; continue; }
        if (it.kind === 'block') {
          const tile = buildHourTile(it.h, true, false);
          tile.addEventListener('click', () => toggleBlock(it.key));
          row.appendChild(tile);
          j++;
          continue;
        }
        // run of expanded hours sharing one block key
        const key = it.key;
        const group = document.createElement('div');
        group.style.cssText = [
          'flex:0 0 auto', 'display:flex', 'gap:6px', 'padding:4px', 'border-radius:14px',
          'background:rgba(0,122,255,0.07)', 'border:1px solid rgba(0,122,255,0.30)'
        ].join(';');
        while (j < items.length && items[j].kind === 'hour' && items[j].key === key) {
          const tile = buildHourTile(items[j].h, false, true);
          tile.addEventListener('click', () => toggleBlock(key));
          group.appendChild(tile);
          j++;
        }
        row.appendChild(group);
      }
      container.appendChild(row);
    });

    plot.appendChild(container);

    // If we arrived here from an Overview day-card click, scroll that day into view.
    const targetDate = window._hourlyScrollDate;
    window._hourlyScrollDate = null;
    if (targetDate) {
      requestAnimationFrame(() => {
        const header = container.querySelector(`[data-date="${targetDate}"]`);
        if (!header) return;
        const plotRect = plot.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        plot.scrollTop += headerRect.top - plotRect.top - 8;
      });
    }
  }

  return { render };
})();
