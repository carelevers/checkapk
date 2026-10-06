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
