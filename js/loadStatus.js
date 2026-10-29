/**
 * Loading indicator (window.LoadStatus)
 *
 * A small card over the plot area with a spinner, the elapsed time and one
 * line per data source ("Open-Meteo forecast … ✓ 0.2 s"). It shows only when
 * a load takes longer than SHOW_AFTER_MS, so cached renders do not flash.
 *
 *   const id = LoadStatus.start();
 *   await LoadStatus.track('Open-Meteo forecast', promise);
 *   LoadStatus.done(id);
 *
 * Rows are keyed by label, so the same source requested several times (the
 * compare panel loads observations once per model) stays one line.
 */
window.LoadStatus = (function () {
  const SHOW_AFTER_MS = 400;
  let gen = 0;
  let startedAt = 0;
  let rows = new Map();      // label -> { pending, t0, state, ms }
  let showTimer = null;
  let tickTimer = null;
  let el = null;

  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'load-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  const secs = ms => (ms / 1000).toFixed(1) + ' s';

  function render() {
    if (!el || el.hidden) return;
    const now = Date.now();
    const lines = [...rows.entries()].map(([label, r]) => {
      const icon = r.state === 'ok' ? '✓' : r.state === 'fail' ? '✗' : '⏳';
      const time = r.state === 'pending' ? secs(now - r.t0) : secs(r.ms);
      return `<li class="ls-${r.state}"><span>${icon} ${label}</span><span>${time}</span></li>`;
    }).join('');
    el.innerHTML =
      `<div class="ls-head"><span class="ls-spinner"></span>Loading weather data… ${secs(now - startedAt)}</div>` +
      `<ul>${lines}</ul>`;
  }

  function start() {
    gen += 1;
    startedAt = Date.now();
    rows = new Map();
    clearTimeout(showTimer);
    clearInterval(tickTimer);
    ensureEl().hidden = true;
    showTimer = setTimeout(() => {
      el.hidden = false;
      render();
      tickTimer = setInterval(render, 100);
    }, SHOW_AFTER_MS);
    return gen;
  }

  function done(id) {
    if (id !== gen) return;   // a newer load has started; leave it alone
    clearTimeout(showTimer);
    clearInterval(tickTimer);
    if (el) el.hidden = true;
  }

  /**
   * Show `label` as pending until `promise` settles. `isOk(value)` decides
   * between ✓ and ✗; by default null/undefined counts as failed (the API
   * helpers return null on errors). Returns the original promise.
   */
  function track(label, promise, isOk = v => v != null) {
    const myGen = gen;
    let r = rows.get(label);
    if (!r || r.state !== 'pending') {
      r = { pending: 0, t0: Date.now(), state: 'pending', ms: 0 };
      rows.set(label, r);
    }
    r.pending += 1;
    const finish = ok => {
      if (myGen !== gen) return;
      r.pending -= 1;
      if (r.pending > 0) return;
      r.state = ok ? 'ok' : 'fail';
      r.ms = Date.now() - r.t0;
      render();
    };
    promise.then(v => finish(isOk(v)), () => finish(false));
    render();
    return promise;
  }

  return { start, done, track };
})();
