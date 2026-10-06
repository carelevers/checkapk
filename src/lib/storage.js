/** Kleine wrappers rond localStorage; werken ook als opslag geblokkeerd is. */

const RECENT_KEY = 'checkapk.recent';
const THEME_KEY = 'checkapk.theme';

/** @param {string} key */
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** @param {string} key @param {string} value */
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* opslag niet beschikbaar */ }
}

/** @returns {{kenteken: string, titel: string}[]} */
export function getRecent() {
  try { return JSON.parse(read(RECENT_KEY) || '[]'); } catch { return []; }
}

/** @param {{kenteken: string, titel: string}} item */
export function addRecent(item) {
  const list = getRecent().filter((r) => r.kenteken !== item.kenteken);
  list.unshift(item);
  write(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}

export const getTheme = () => read(THEME_KEY);
/** @param {'light'|'dark'} theme */
export const setTheme = (theme) => write(THEME_KEY, theme);

const CACHE_PREFIX = 'checkapk.cache.';

/**
 * Leest een gecachete waarde, of null als die ontbreekt of ouder is dan maxAgeMs.
 * @param {string} key @param {number} maxAgeMs
 */
export function cacheGet(key, maxAgeMs) {
  try {
    const raw = read(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < maxAgeMs ? v : null;
  } catch { return null; }
}

/** Bewaart een waarde met tijdstempel (stil mislukken als de opslag vol is). @param {string} key @param {unknown} value */
export function cacheSet(key, value) {
  write(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
}
