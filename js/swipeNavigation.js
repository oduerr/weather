window.SwipeNavigation = {
  isEnabled: true,
  touchStartX: null,
  touchStartY: null,
  touchStartTime: null,
  minSwipeDistance: 50,
  maxSwipeTime: 500,

  init: function() {
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    document.addEventListener('touchend',   this.handleTouchEnd.bind(this),   { passive: true });
    document.addEventListener('keydown',    this.handleKeyDown.bind(this),    { passive: false });
  },

  controlsHidden: function() {
    const c = document.getElementById('controls');
    return c && c.classList.contains('fade-out');
  },

  getActivePlotElement: function() {
    const cc = document.getElementById('compare-chart');
    if (cc && cc.classList.contains('js-plotly-plot')) return cc;
    const p = document.getElementById('plot');
    if (p  && p.classList.contains('js-plotly-plot'))  return p;
    return null;
  },

  handleTouchStart: function(event) {
    if (!this.isEnabled) return;
    const t = event.touches[0];
    this.touchStartX    = t.clientX;
    this.touchStartY    = t.clientY;
    this.touchStartTime = Date.now();
  },

  handleTouchEnd: function(event) {
    if (!this.isEnabled || this.touchStartX === null) { this.reset(); return; }

    const t      = event.changedTouches[0];
    const dx     = t.clientX - this.touchStartX;
    const dy     = t.clientY - this.touchStartY;
    const dt     = Date.now() - this.touchStartTime;
    const adx    = Math.abs(dx);
    const ady    = Math.abs(dy);

    if (dt <= this.maxSwipeTime) {
      if (adx >= this.minSwipeDistance && adx > ady * 1.5) {
        // Horizontal — pan time axis (map-drag convention: swipe left = later time)
        this.panTime(dx > 0 ? 'left' : 'right');
      } else if (ady >= this.minSwipeDistance && ady > adx * 1.5) {
        // Vertical — switch panel
        this.switchPanel(dy > 0 ? 'down' : 'up');
      }
    }
    this.reset();
  },

  handleKeyDown: function(event) {
    if (!this.isEnabled) return;
    if (['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName.toUpperCase())) return;
    if (event.key === 'ArrowLeft')  { event.preventDefault(); this.panTime('left');  }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.panTime('right'); }
  },

  panTime: function(direction) {
    const el = this.getActivePlotElement();
    if (!el) return;

    const layout = el.layout || el._fullLayout || {};
    const range  = layout.xaxis && layout.xaxis.range;
    if (!Array.isArray(range) || range.length !== 2) return;

    const start = new Date(range[0]);
    const end   = new Date(range[1]);
    const pan   = (end - start) * 0.75;
    let ns = new Date(start.getTime() + (direction === 'right' ?  pan : -pan));
    let ne = new Date(end.getTime()   + (direction === 'right' ?  pan : -pan));

    // Clamp to data boundaries
    const ds = el.getAttribute('data-start-time');
    const de = el.getAttribute('data-end-time');
    if (ds && de) {
      const dStart = new Date(ds), dEnd = new Date(de);
      if (ns < dStart) { ne = new Date(ne.getTime() + (dStart - ns)); ns = dStart; }
      if (ne > dEnd)   { ns = new Date(ns.getTime() - (ne - dEnd));   ne = dEnd;   }
      if (ns < dStart) ns = dStart;
      if (ne > dEnd)   ne = dEnd;
    }

    const fmt = d => d.toISOString().replace('Z', '');
    window._savedXRange = { start: fmt(ns), end: fmt(ne) };

    if (el.id === 'compare-chart' && window.ComparePanel && window.ComparePanel.animateRange) {
      window.ComparePanel.animateRange(ns, ne);
      return;
    }
    Plotly.animate(el.id, {
      layout: { 'xaxis.range': [fmt(ns), fmt(ne)] }
    }, {
      transition: { duration: 600, easing: 'ease-out' },
      frame:      { duration: 600, redraw: false }
    });
  },

  switchPanel: function(direction) {
    const sel = document.getElementById('panelSelect');
    if (!sel) return;
    const n = sel.options.length;
    sel.selectedIndex = direction === 'up'
      ? (sel.selectedIndex - 1 + n) % n
      : (sel.selectedIndex + 1) % n;
    sel.dispatchEvent(new Event('change'));
  },

  reset: function() {
    this.touchStartX = this.touchStartY = this.touchStartTime = null;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => window.SwipeNavigation.init(), 300);
});
