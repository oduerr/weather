/**
 * Hourly Panel — mobile-friendly swipeable hour tiles
 *
 * Renders a vertical list of days; each day is a horizontally scroll-snapping
 * row of compact hour tiles. Each tile shows: hour, weather symbol, temperature,
 * UV index, wind (speed + direction arrow), and precipitation (probability + amount).
 *
 * No Plotly — pure DOM under #plot (same pattern as the actuals panel), so it
 * sidesteps the mobile sizing/viewport issues that affect the chart panels.
 *
 * Signature: render(data, location, model, config)
 *   data.forecast.hourly.{ time, temperature_2m, weather_code, uv_index,
 *                          wind_speed_10m, wind_direction_10m, wind_gusts_10m,
 *                          precipitation, precipitation_probability }
 */
window.HourlyPanel = (function () {
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

  function dayLabel(dateStr, todayStr, tomorrowStr) {
    const d = new Date(dateStr + 'T12:00');
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dm = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    if (dateStr === todayStr) return `Today · ${weekday} ${dm}`;
    if (dateStr === tomorrowStr) return `Tomorrow · ${weekday} ${dm}`;
    return `${weekday} ${dm}`;
  }

  function buildTile(h, isNow) {
    const tile = document.createElement('div');
    tile.style.cssText = [
      'flex:0 0 auto', 'scroll-snap-align:start', 'width:62px',
      'box-sizing:border-box', 'padding:8px 4px', 'border-radius:12px',
      'text-align:center', 'background:' + (isNow ? '#eaf3ff' : '#f7f7f9'),
      'border:' + (isNow ? '1.5px solid #007AFF' : '1px solid #ececf0'),
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:2px'
    ].join(';');

    const hour = document.createElement('div');
    hour.textContent = isNow ? 'Now' : h.hour;
    hour.style.cssText = 'font-size:12px;font-weight:600;color:' + (isNow ? '#007AFF' : '#555');

    const sym = document.createElement('div');
    sym.textContent = icon(h.code);
    sym.style.cssText = 'font-size:22px;line-height:1.1';

    const temp = document.createElement('div');
    temp.textContent = h.temp != null ? `${h.temp}°` : '–';
    temp.style.cssText = 'font-size:16px;font-weight:700;color:#222';

    // UV — only show when meaningful (>0, i.e. daytime)
    const uv = document.createElement('div');
    if (h.uv != null && h.uv >= 0.5) {
      uv.textContent = `☀️${h.uv}`;
      uv.style.cssText = 'font-size:11px;color:#c47f00';
    } else {
      uv.innerHTML = '&nbsp;';
      uv.style.cssText = 'font-size:11px';
    }

    // Wind — speed + direction arrow
    const wind = document.createElement('div');
    wind.textContent = h.wind != null ? `${h.wind}${h.arrow}` : '';
    wind.style.cssText = 'font-size:11px;color:#444;white-space:nowrap';
    wind.title = 'Wind km/h (gust ' + (h.gust != null ? h.gust : '?') + ')';

    // Precipitation — probability + amount; emphasised when wet
    const precip = document.createElement('div');
    const hasProb = h.pop != null && h.pop > 0;
    const hasAmt = h.precip != null && h.precip > 0;
    if (hasProb || hasAmt) {
      const probTxt = h.pop != null ? `${h.pop}%` : '';
      const amtTxt = hasAmt ? `${h.precip}mm` : '';
      precip.innerHTML = `<div>💧${probTxt}</div>` + (amtTxt ? `<div>${amtTxt}</div>` : '');
      precip.style.cssText = 'font-size:11px;color:#0a7cd1;font-weight:600;line-height:1.2';
    } else {
      precip.innerHTML = '<div>&nbsp;</div>';
      precip.style.cssText = 'font-size:11px';
    }

    tile.appendChild(hour);
    tile.appendChild(sym);
    tile.appendChild(temp);
    tile.appendChild(uv);
    tile.appendChild(wind);
    tile.appendChild(precip);
    return tile;
  }

  function render(data, location, model, config = {}) {
    const plot = document.getElementById('plot');
    if (!plot) return;

    // Clear any existing Plotly chart / DOM
    if (window.Plotly && plot.classList && plot.classList.contains('js-plotly-plot')) {
      try { Plotly.purge(plot); } catch (_) {}
    }
    plot.innerHTML = '';

    const hourly = data && data.forecast && data.forecast.hourly ? data.forecast.hourly : null;
    if (!hourly || !hourly.time || hourly.time.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'padding:24px;text-align:center;color:#888;';
      msg.textContent = 'No hourly forecast data available.';
      plot.appendChild(msg);
      return;
    }

    const now = berlinNow();
    const todayStr = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('sv-SE');
    const currentHourStart = new Date(now);
    currentHourStart.setMinutes(0, 0, 0);

    const T = hourly.time;
    const temp = hourly.temperature_2m || [];
    const code = hourly.weather_code || [];
    const uv = hourly.uv_index || [];
    const wind = hourly.wind_speed_10m || [];
    const gust = hourly.wind_gusts_10m || [];
    const dir = hourly.wind_direction_10m || [];
    const precip = hourly.precipitation || [];
    const pop = hourly.precipitation_probability || [];

    // Build per-hour records from the current hour onward, grouped by day.
    const days = [];
    let lastDate = null;
    let nowMarked = false;
    for (let i = 0; i < T.length; i++) {
      const t = new Date(T[i]);
      if (t < currentHourStart) continue; // skip past hours
      const dateStr = T[i].slice(0, 10);
      if (dateStr !== lastDate) {
        days.push({ dateStr, hours: [] });
        lastDate = dateStr;
      }
      const isNow = !nowMarked;
      if (isNow) nowMarked = true;
      days[days.length - 1].hours.push({
        hour: T[i].slice(11, 16),
        isNow,
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
    title.textContent = `${location && location.name ? location.name : ''} — hourly` +
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

      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'gap:6px', 'overflow-x:auto', 'scroll-snap-type:x mandatory',
        'padding:4px 12px 8px', '-webkit-overflow-scrolling:touch'
      ].join(';');
      day.hours.forEach(h => row.appendChild(buildTile(h, h.isNow)));
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
