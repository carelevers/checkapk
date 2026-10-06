/**
 * Hash-router: #/pad/onderdelen?query. Elke route koppelt een pad aan een render-functie
 * en een menu-item. Een nieuwe pagina toevoegen: zie docs/CONTRIBUTING.md.
 */
import { renderAskPage } from './pages/ask.js';
import { renderComparePage } from './pages/compare.js';
import { renderDatasetsPage } from './pages/datasets.js';
import { renderHomePage } from './pages/home.js';
import { renderModelPage } from './pages/model.js';
import { renderVehiclePage } from './pages/vehicle/index.js';

/**
 * @typedef {object} Route
 * @property {string} path      eerste deel van het pad ('' = startpagina)
 * @property {string} nav       welk menu-item actief wordt (data-nav in index.html)
 * @property {(el: HTMLElement, parts: string[], query: Record<string, string>) => void} render
 */

/** @type {Route[]} */
const ROUTES = [
  { path: 'k', nav: 'home', render: (el, [kenteken, tab]) => (kenteken ? renderVehiclePage(el, { kenteken, tab }) : renderHomePage(el)) },
  { path: 'vergelijk', nav: 'vergelijk', render: (el, [list]) => renderComparePage(el, { list }) },
  { path: 'model', nav: 'model', render: (el, _, q) => renderModelPage(el, q) },
  { path: 'vraag', nav: 'vraag', render: (el, _, q) => renderAskPage(el, q) },
  { path: 'datasets', nav: 'datasets', render: (el, _, q) => renderDatasetsPage(el, q) },
  { path: '', nav: 'home', render: (el) => renderHomePage(el) },
];

/** Leest de huidige hash. */
function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [head = '', ...parts] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { head, parts, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

/** @param {HTMLElement} el container waarin pagina's getekend worden */
export function startRouter(el) {
  const render = () => {
    const { head, parts, query } = parseHash();
    const route = ROUTES.find((r) => r.path === head) || ROUTES[ROUTES.length - 1];
    route.render(el, parts, query);
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', /** @type {HTMLElement} */ (a).dataset.nav === route.nav));
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', render);
  render();
}
