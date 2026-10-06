/** "Auto's vergelijken" (#/vergelijk/K1,K2,…): tot vier kentekens naast elkaar. */
import { fetchVehicle } from '../api/vehicle.js';
import { formatKenteken, normalizeKenteken } from '../domain/kenteken.js';
import { summarizeVehicle } from '../domain/vehicle-summary.js';
import { fmtDate, fmtEuro, fmtNum, fmtScore, num } from '../lib/format.js';
import { getReport } from '../services/report.js';
import { errorBox, esc, loading, plateBadge } from '../ui/html.js';

const MAX_CARS = 4;

/**
 * Rijen van de vergelijktabel: [label, waarde, opmaak, richting].
 * Richting: 1 = hoger is beter, -1 = lager is beter, 0 = niet vergelijken.
 * @type {[string, (c: any) => any, (v: any, c: any) => string, -1|0|1][]}
 */
const ROWS = [
  ['Rapportcijfer', (c) => c.rapport?.total ?? null, (x, c) => `<span class="score-inline ${c.rapport.verdict.cls}">${fmtScore(x)}</span> ${esc(c.rapport.verdict.label)}`, 1],
  ['Merk & model', (c) => c.titel, esc, 0],
  ['Bouwjaar', (c) => c.bouwjaar, String, 1],
  ['Brandstof', (c) => c.brandstof, esc, 0],
  ['Kleur', (c) => c.v.eerste_kleur, esc, 0],
  ['Inrichting', (c) => c.v.inrichting, esc, 0],
  ['Vermogen (pk)', (c) => c.pk, (x) => fmtNum(x), 1],
  ['Cilinderinhoud (cc)', (c) => num(c.v.cilinderinhoud), (x) => fmtNum(x), 0],
  ['Gewicht (kg)', (c) => num(c.v.massa_rijklaar), (x) => fmtNum(x), -1],
  ['Trekgewicht geremd (kg)', (c) => num(c.v.maximum_trekken_massa_geremd), (x) => fmtNum(x), 1],
  ['Catalogusprijs', (c) => num(c.v.catalogusprijs), fmtEuro, 0],
  ['CO₂ (g/km)', (c) => c.co2, (x) => fmtNum(x), -1],
  ['Verbruik (l/100km)', (c) => c.verbruik, (x) => fmtNum(x, 1), -1],
  ['Actieradius EV (km)', (c) => c.bereik, (x) => fmtNum(x), 1],
  ['Euroklasse', (c) => c.euroklasse, esc, 0],
  ['Energielabel', (c) => c.v.zuinigheidsclassificatie, esc, 0],
  ['APK geldig t/m', (c) => (c.apk ? c.apk.getTime() : null), (x) => fmtDate(new Date(x)), 1],
  ['APK-keuringen', (c) => c.history.length, (x) => fmtNum(x), 0],
  ['Mankementen bij APK', (c) => c.totaalGebreken, (x) => fmtNum(x), 0],
  ['Mankementen per APK', (c) => c.gebrekenPerKeuring, (x) => fmtNum(x, 2), -1],
  ['Open terugroepacties', (c) => c.terugroepOpen, (x) => fmtNum(x), -1],
  ['Kilometerstand (NAP)', (c) => c.v.tellerstandoordeel, esc, 0],
  ['Op naam sinds', (c) => (c.eigenaarSinds ? c.eigenaarSinds.getTime() : null), (x) => fmtDate(new Date(x)), 0],
  ['Verzekerd', (c) => c.v.wam_verzekerd, esc, 0],
];

/** @param {string} k */
async function loadCar(k) {
  try {
    const data = await fetchVehicle(k);
    if (!data.voertuig.rows.length) return { kenteken: k, missing: true };
    const s = summarizeVehicle(data);
    return { ...s, rapport: await getReport(s, data) };
  } catch {
    return { kenteken: k, missing: true };
  }
}

/** @param {any[]} cars */
function tableBody(cars) {
  return ROWS.map(([label, get, fmt, dir]) => {
    const vals = cars.map(get);
    const nums = vals.filter((v) => typeof v === 'number');
    const best = dir && nums.length > 1 ? (dir > 0 ? Math.max(...nums) : Math.min(...nums)) : null;
    const allSame = nums.length > 1 && nums.every((x) => x === nums[0]);
    return `<tr><td>${esc(label)}</td>${vals.map((v, i) =>
      `<td class="${best != null && v === best && !allSame ? 'best' : ''}">${v == null || v === '' ? '–' : fmt(v, cars[i])}</td>`).join('')}</tr>`;
  }).join('');
}

/** @param {HTMLElement} el @param {{list?: string}} params */
export async function renderComparePage(el, params) {
  const list = (params.list || '').split(',').map(normalizeKenteken).filter(Boolean).slice(0, MAX_CARS);
  const inputs = Array.from({ length: MAX_CARS }, (_, i) => `<div class="plate-input small"><span class="nl">NL</span>
    <input name="k${i}" value="${esc(list[i] ? formatKenteken(list[i]) : '')}" placeholder="AB-12-CD" maxlength="10" autocomplete="off"></div>`).join('');
  el.innerHTML = `<section class="card"><h2>Auto's vergelijken</h2><p class="sub">Twijfel je tussen een paar auto's? Typ tot vier kentekens en zie welke het beste scoort.</p>
    <form class="form-row" data-compare-form>${inputs}<button class="btn">Vergelijk</button></form></section><div data-compare-out></div>`;
  el.querySelector('[data-compare-form]')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const ks = [...new FormData(/** @type {HTMLFormElement} */ (ev.target)).values()].map(normalizeKenteken).filter(Boolean);
    location.hash = '#/vergelijk/' + ks.join(',');
  });
  if (!list.length) return;

  const out = /** @type {HTMLElement} */ (el.querySelector('[data-compare-out]'));
  out.innerHTML = loading('Auto\'s ophalen en rapporten opstellen…');
  const all = await Promise.all(list.map(loadCar));
  const cars = all.filter((c) => !c.missing);
  const missing = all.filter((c) => c.missing);
  if (!cars.length) { out.innerHTML = errorBox('Geen van de kentekens gevonden.'); return; }
  out.innerHTML = `${missing.length ? `<div class="notice">Niet gevonden: ${missing.map((m) => esc(formatKenteken(m.kenteken))).join(', ')}</div><br>` : ''}
    <section class="card"><div class="table-wrap"><table class="data compare">
      <thead><tr><th></th>${cars.map((c) => `<th><a href="#/k/${esc(c.kenteken)}">${plateBadge(c.kenteken)}</a></th>`).join('')}</tr></thead>
      <tbody>${tableBody(cars)}</tbody></table></div>
      <p class="small muted">Groen = beste waarde. Begin bij het rapportcijfer bovenaan.</p></section>`;
}
