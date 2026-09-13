/**
 * Namespaced localStorage wrapper.
 *
 * Every key this app writes lives under the "weather:" prefix. `oduerr.github.io`
 * is a single origin for all GitHub Pages projects, so unprefixed keys such as
 * `weatherDataCache` or `meta_icon_d2` sit in the same bucket as every other
 * project hosted there.
 *
 * The prefix isolates key *names*, not quota — the ~5 MB budget stays per origin.
 * So the cache helpers below also keep this app inside a fixed share of it and
 * evict oldest-first, instead of letting setItem throw once the bucket is full.
 */

window.WeatherStorage = (function() {
  const PREFIX = "weather:";
  const CACHE_PREFIX = PREFIX + "cache:";

  // Soft cap on how much of the shared origin quota this app claims.
  // Chrome counts localStorage in UTF-16, so ~2.6M characters fill a 5 MiB
  // quota. Staying near 1.5M leaves room for the other projects on the origin.
  // One ECMWF ensemble response alone is ~860k characters.
  const BUDGET_CHARS = 1500000;

  let _available = null;

  function available() {
    if (_available === null) {
      try {
        const probe = PREFIX + "__probe__";
        localStorage.setItem(probe, "1");
        localStorage.removeItem(probe);
        _available = true;
      } catch (e) {
        console.warn("localStorage unavailable, running without cache:", e);
        _available = false;
      }
    }
    return _available;
  }

  /** All keys in the namespace, without the prefix. */
  function keys(prefix) {
    if (!available()) return [];
    const want = prefix || PREFIX;
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(want)) out.push(k);
    }
    return out;
  }

  function get(key) {
    if (!available()) return null;
    return localStorage.getItem(PREFIX + key);
  }

  function set(key, value) {
    if (!available()) return false;
    try {
      localStorage.setItem(PREFIX + key, value);
      return true;
    } catch (e) {
      console.warn("Could not store", PREFIX + key, e && e.name);
      return false;
    }
  }

  function remove(key) {
    if (!available()) return;
    localStorage.removeItem(PREFIX + key);
  }

  /** Characters used by this app's keys, and by the whole origin. */
  function usage() {
    if (!available()) return { weather: 0, origin: 0 };
    let weather = 0, origin = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const size = k.length + (localStorage.getItem(k) || "").length;
      origin += size;
      if (k.startsWith(PREFIX)) weather += size;
    }
    return { weather, origin };
  }

  /** Cache entries only, newest first, with their size in characters. */
  function cacheEntries() {
    return keys(CACHE_PREFIX).map(k => {
      const raw = localStorage.getItem(k) || "";
      let stamp = 0;
      try { stamp = JSON.parse(raw).timestamp || 0; } catch (e) {}
      return { key: k, size: k.length + raw.length, timestamp: stamp };
    }).sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Drop entries whose TTL has passed. Safe to call on every load. */
  function purgeExpired() {
    if (!available()) return 0;
    const now = Date.now();
    let dropped = 0;
    keys(CACHE_PREFIX).forEach(k => {
      try {
        const entry = JSON.parse(localStorage.getItem(k));
        if (!entry || !entry.expires || entry.expires < now) {
          localStorage.removeItem(k);
          dropped++;
        }
      } catch (e) {
        localStorage.removeItem(k);
        dropped++;
      }
    });
    return dropped;
  }

  /** Remove oldest cache entries until `needed` characters are free. */
  function evictOldest(needed, keepKey) {
    const entries = cacheEntries();
    let used = entries.reduce((sum, e) => sum + e.size, 0);
    let freed = 0;
    while (entries.length && used + needed > BUDGET_CHARS) {
      const victim = entries.pop(); // oldest
      if (victim.key === keepKey) continue;
      localStorage.removeItem(victim.key);
      used -= victim.size;
      freed += victim.size;
    }
    return freed;
  }

  /**
   * Read a cache entry, honouring the TTL stored with it.
   * @returns {*} the cached value, or null when missing or stale
   */
  function getCached(key) {
    if (!available()) return null;
    const fullKey = CACHE_PREFIX + key;
    const raw = localStorage.getItem(fullKey);
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw);
      if (entry.expires && entry.expires > Date.now()) return entry.data;
      localStorage.removeItem(fullKey);
    } catch (e) {
      localStorage.removeItem(fullKey);
    }
    return null;
  }

  /**
   * Store a cache entry. Never throws: a full bucket costs the cache, not the
   * render. Evicts oldest-first to stay inside BUDGET_CHARS, then retries once
   * against a real QuotaExceededError.
   * @returns {boolean} whether the value was stored
   */
  function setCached(key, data, ttlMs) {
    if (!available()) return false;
    const fullKey = CACHE_PREFIX + key;
    let raw;
    try {
      raw = JSON.stringify({ data, timestamp: Date.now(), expires: Date.now() + ttlMs });
    } catch (e) {
      return false;
    }

    const needed = fullKey.length + raw.length;
    if (needed > BUDGET_CHARS) {
      console.warn(`Not caching ${key}: ${needed} chars exceeds the whole budget`);
      return false;
    }

    localStorage.removeItem(fullKey); // so the old copy is not counted as used
    purgeExpired();
    evictOldest(needed, fullKey);

    try {
      localStorage.setItem(fullKey, raw);
      return true;
    } catch (e) {
      // Another project on the origin is using the rest of the quota.
      console.warn("Cache write failed, dropping this app's cache:", e && e.name);
      keys(CACHE_PREFIX).forEach(k => localStorage.removeItem(k));
      try {
        localStorage.setItem(fullKey, raw);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  /** Drop every cache entry, keeping preferences. */
  function clearCache() {
    keys(CACHE_PREFIX).forEach(k => localStorage.removeItem(k));
  }

  /** Drop everything this app owns, preferences included. */
  function clearAll() {
    keys(PREFIX).forEach(k => localStorage.removeItem(k));
  }

  /**
   * One-time cleanup of the unprefixed keys earlier versions wrote.
   * Caches are simply dropped (they refetch); the radar preferences are moved.
   */
  function migrateLegacy() {
    if (!available()) return;
    const movedPrefs = ["radar_links_collapsed", "radar_dashboard_compact"];
    movedPrefs.forEach(k => {
      const value = localStorage.getItem(k);
      if (value !== null) {
        if (localStorage.getItem(PREFIX + k) === null) set(k, value);
        localStorage.removeItem(k);
      }
    });

    const legacyCaches = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === "weatherDataCache" || (k && k.startsWith("meta_"))) legacyCaches.push(k);
    }
    legacyCaches.forEach(k => localStorage.removeItem(k));
  }

  migrateLegacy();
  purgeExpired();

  return {
    PREFIX, CACHE_PREFIX, BUDGET_CHARS,
    available, keys, get, set, remove, usage,
    getCached, setCached, purgeExpired, clearCache, clearAll
  };
})();
