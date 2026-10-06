/** Startpunt van de app. */
import { getTheme, setTheme } from './lib/storage.js';
import { startRouter } from './router.js';

/** Licht/donker thema: onthouden keuze, anders de systeeminstelling. */
function initTheme() {
  const root = document.documentElement;
  const saved = getTheme();
  if (saved) root.dataset.theme = saved;
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    setTheme(/** @type {'light'|'dark'} */ (root.dataset.theme));
  });
}

initTheme();
startRouter(/** @type {HTMLElement} */ (document.getElementById('app')));
