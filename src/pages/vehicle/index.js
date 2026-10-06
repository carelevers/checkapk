/** Kentekenpagina: haalt alle gegevens op en toont ze in tabbladen. */
import { fetchVehicle } from '../../api/vehicle.js';
import { formatKenteken, normalizeKenteken } from '../../domain/kenteken.js';
import { summarizeVehicle } from '../../domain/vehicle-summary.js';
import { addRecent } from '../../lib/storage.js';
import { getReport } from '../../services/report.js';
import { resolvePeerFilter } from '../../services/model-stats.js';
import { errorBox, esc, loading } from '../../ui/html.js';
import { plateHtml } from '../../ui/plate.js';
import { setHeaderPlate } from '../../ui/plate-search.js';
import { renderModelAnalysis } from '../model.js';
import { renderHeaderPhotos, vehicleHeaderHtml } from './header.js';
import { findCarPhotos } from '../../api/commons.js';
import { bindGallery, galleryHtml } from '../../ui/gallery.js';
import { renderReportTab, scorePillHtml } from './report-tab.js';
import { apkTab, fuelTab, overviewTab, rawDataTab, recallsTab, specsTab } from './tabs.js';

/** @typedef {import('./tabs.js').TabContext} TabContext */

/** Voorbeeldfoto's van het model van deze auto (gecachet door findCarPhotos). @param {TabContext} ctx */
const photosFor = ({ s }) => findCarPhotos({ merk: s.v.merk || '', model: s.v.handelsbenaming || '', year: s.bouwjaar });
/**
 * @typedef {object} Tab
 * @property {string} id      deel van de URL (#/k/KENTEKEN/id)
 * @property {string} label
 * @property {(ctx: TabContext) => number} [count]  getal achter het label
 * @property {(el: HTMLElement, ctx: TabContext) => void} render
 */

/** Helper voor tabbladen die alleen HTML teruggeven. @param {(ctx: TabContext) => string} fn */
const html = (fn) => (el, ctx) => { el.innerHTML = fn(ctx); };

/** @type {Tab[]} De volgorde hier is de volgorde op het scherm; de eerste is de standaard. */
const TABS = [
  { id: 'rapport', label: 'Rapport', render: renderReportTab },
  { id: 'overzicht', label: 'Overzicht', render: html(overviewTab) },
  { id: 'apk', label: 'APK-keuringen', count: ({ s }) => s.history.length, render: html(apkTab) },
  { id: 'terugroep', label: 'Terugroepacties', count: ({ s }) => s.terugroepTotaal, render: html(recallsTab) },
  { id: 'milieu', label: 'Verbruik & milieu', render: html(fuelTab) },
  { id: 'techniek', label: 'Specificaties', render: html(specsTab) },
  {
    id: 'vergelijk', label: 'Vergelijken',
    render: (el, { s }) => {
      el.innerHTML = loading('Vergelijkgroep bepalen…');
      resolvePeerFilter(s).then((f) => renderModelAnalysis(el, f, s));
    },
  },
  {
    id: 'fotos', label: 'Foto\'s',
    render: (el, ctx) => {
      el.innerHTML = loading('Foto\'s zoeken…');
      photosFor(ctx).then((photos) => {
        el.innerHTML = `<section class="card"><h2>Foto's van de ${esc(ctx.s.titel)}</h2>${galleryHtml(photos)}</section>`;
        bindGallery(el, photos);
      });
    },
  },
  { id: 'data', label: 'Alle gegevens', render: html(rawDataTab) },
];

/**
 * @param {HTMLElement} el
 * @param {{kenteken: string, tab?: string}} params
 */
export async function renderVehiclePage(el, { kenteken, tab }) {
  const k = normalizeKenteken(kenteken);
  setHeaderPlate(k);
  el.innerHTML = `<div data-result>${loading('RDW-gegevens ophalen voor ' + formatKenteken(k) + '…')}</div>`;
  const res = /** @type {HTMLElement} */ (el.querySelector('[data-result]'));

  let data;
  try { data = await fetchVehicle(k); } catch (e) { res.innerHTML = errorBox('Ophalen mislukt: ' + e.message); return; }
  if (data.voertuig.error) { res.innerHTML = errorBox('De RDW API gaf een fout: ' + data.voertuig.error); return; }
  if (!data.voertuig.rows.length) {
    res.innerHTML = `<div class="card"><h2>Geen voertuig gevonden</h2><p class="muted">Kenteken ${plateHtml(k, 'xs')} staat niet in het RDW-register (of is nog niet gepubliceerd).</p></div>`;
    return;
  }

  const s = summarizeVehicle(data);
  /** @type {TabContext} */
  const ctx = { s, data };
  addRecent({ kenteken: k, titel: s.titel });

  res.innerHTML = vehicleHeaderHtml(s) + `
    <div class="subtabs" role="tablist">${TABS.map((t) => {
      const c = t.count ? t.count(ctx) : 0;
      return `<button role="tab" data-tab="${t.id}">${esc(t.label)}${c ? `<span class="count">${c}</span>` : ''}</button>`;
    }).join('')}</div>
    <div data-tab-body></div>`;
  const body = /** @type {HTMLElement} */ (res.querySelector('[data-tab-body]'));

  /** @param {string} id */
  const show = (id) => {
    const t = TABS.find((x) => x.id === id) || TABS[0];
    res.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.tab === t.id));
    history.replaceState(null, '', '#/k/' + k + (t === TABS[0] ? '' : '/' + t.id));
    body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in');
    t.render(body, ctx);
  };
  res.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => show(/** @type {HTMLElement} */ (b).dataset.tab || '')));
  // Links met data-goto (ook in later geladen inhoud) wisselen van tabblad
  res.addEventListener('click', (ev) => {
    const a = /** @type {HTMLElement} */ (ev.target).closest('[data-goto]');
    if (!a) return;
    ev.preventDefault();
    show(/** @type {HTMLElement} */ (a).dataset.goto || '');
  });
  show(tab || TABS[0].id);

  photosFor(ctx).then((photos) => {
    const slot = /** @type {HTMLElement|null} */ (res.querySelector('[data-vehicle-photo]'));
    if (!slot) return;
    renderHeaderPhotos(slot, photos);
    bindGallery(slot, photos);
  });

  getReport(s, data).then((r) => {
    const slot = res.querySelector('[data-score-pill]');
    if (slot) slot.innerHTML = scorePillHtml(r);
  }).catch(() => { /* zonder cijfer in de kop */ });
}
