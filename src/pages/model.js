/**
 * "Model bekijken" (#/model) en het tabblad "Vergelijk met zelfde type":
 * statistieken van een model/generatie, optioneel met de eigen auto ernaast.
 */
import { formatKenteken } from '../domain/kenteken.js';
import { describePeerFilter } from '../domain/generation.js';
import { powerBuckets } from '../domain/vehicle-summary.js';
import { DEFECT_SAMPLE_SIZE } from '../config.js';
import { fmtEuro, fmtNum, num } from '../lib/format.js';
import { computeModelStats, fetchGenerations, filterGenerationKey, generationKey } from '../services/model-stats.js';
import { barChart, columnChart } from '../ui/charts.js';
import { dataTable, errorBox, esc, loading, statTile } from '../ui/html.js';

/** @typedef {import('../domain/generation.js').PeerFilter} PeerFilter */
/** @typedef {import('../domain/vehicle-summary.js').VehicleSummary} VehicleSummary */
/** @typedef {import('../services/model-stats.js').ModelStats} ModelStats */

/** Route-handler voor #/model. @param {HTMLElement} el @param {Record<string, string>} params */
export function renderModelPage(el, params) {
  const { merk = '', model = '', van = '', tot = '', tgk = '', type = '' } = params;
  renderModelAnalysis(el, { merk, model, van, tot, tgk, type }, null);
}

/**
 * Formulier + generaties + statistieken.
 * @param {HTMLElement} el @param {PeerFilter} f @param {VehicleSummary|null} self
 */
export function renderModelAnalysis(el, f, self) {
  el.innerHTML = `<section class="card">
    <h2>${self ? 'Vergelijk met hetzelfde type' : 'Modelanalyse'}</h2>
    <p class="sub">Statistieken over alle geregistreerde voertuigen van dit merk en model in Nederland, en APK-gebreken over een steekproef van ${DEFECT_SAMPLE_SIZE} auto's.</p>
    <form class="form-row" data-model-form>
      <input type="hidden" name="tgk" value="${esc(f.tgk || '')}"><input type="hidden" name="type" value="${esc(f.tgk ? '' : f.type || '')}">
      <label class="field">Merk<input name="merk" value="${esc(f.merk)}" placeholder="bijv. VOLKSWAGEN" required></label>
      <label class="field">Model<input name="model" value="${esc(f.model)}" placeholder="bijv. GOLF"></label>
      <label class="field">Bouwjaar van<input name="van" type="number" min="1900" max="2100" value="${esc(f.van || '')}"></label>
      <label class="field">tot<input name="tot" type="number" min="1900" max="2100" value="${esc(f.tot || '')}"></label>
      <button class="btn">Analyseer</button>
    </form>
    ${f.tgk || f.type ? `<p class="gen-chip-row"><span class="gen-chip">Alleen ${f.tgk ? 'generatie ' + esc(f.tgk) : 'type ' + esc(f.type)} <button type="button" data-gen-clear title="Alle generaties">✕</button></span></p>` : ''}
    ${f.groep ? `<p class="small muted">Automatisch gekozen vergelijkgroep: ${esc(f.groep)}.</p>` : ''}
    </section><div data-gen-out></div><div data-model-out></div>`;

  const form = /** @type {HTMLFormElement} */ (el.querySelector('[data-model-form]'));
  /** @param {Record<string, any>} nf */
  const run = (nf) => {
    if (self) { renderModelAnalysis(el, /** @type {PeerFilter} */ (nf), self); return; }
    location.hash = '#/model?' + new URLSearchParams(Object.entries(nf).filter(([, v]) => v !== '' && v != null)).toString();
  };
  form.addEventListener('submit', (ev) => { ev.preventDefault(); run(Object.fromEntries(new FormData(form))); });
  el.querySelector('[data-gen-clear]')?.addEventListener('click', () => run({ ...Object.fromEntries(new FormData(form)), tgk: '', type: '' }));

  if (f.merk && f.model) renderGenerations(/** @type {HTMLElement} */ (el.querySelector('[data-gen-out]')), f, self, run);
  if (f.merk) renderStats(/** @type {HTMLElement} */ (el.querySelector('[data-model-out]')), f, self);
}

/** Tabel met generaties; "Alleen deze" filtert op die generatie. */
async function renderGenerations(el, f, self, run) {
  el.innerHTML = loading('Generaties opzoeken…');
  let g;
  try { g = await fetchGenerations(f); } catch { el.innerHTML = ''; return; }
  if (!g.list.length) { el.innerHTML = ''; return; }
  const selfKey = self ? generationKey(self.v) : '';
  const activeKey = filterGenerationKey(f);
  const years = (x) => (x.van && x.tot ? (x.van === x.tot ? x.van : `${x.van}–${x.tot}`) : '?');
  el.innerHTML = `<section class="card"><h2>Generaties en uitvoeringen van de ${esc(f.model.toUpperCase())}</h2>
    <p class="sub">Herkend aan de Europese typegoedkeuring. Jaren = waarin 90% van deze auto's voor het eerst op kenteken kwam (later geïmporteerde exemplaren tellen niet mee).</p>
    <div class="table-wrap"><table class="data gens"><thead><tr><th>Vooral gebouwd</th><th class="num">Aantal</th><th>Type</th><th>Typegoedkeuring</th><th></th></tr></thead><tbody>
    ${g.list.map((x) => `<tr class="${x.key === activeKey ? 'active' : ''}">
      <td><b>${years(x)}</b>${x.min && x.max && (x.min < x.van || x.max > x.tot) ? ` <span class="muted small">(${x.min}–${x.max})</span>` : ''}
        ${x.key === selfKey ? ' <span class="badge ok">deze auto</span>' : ''}</td>
      <td class="num">${fmtNum(x.n)}</td><td>${esc(x.types.join(', '))}</td><td><code>${esc(x.tgk || '–')}</code></td>
      <td>${x.key === activeKey ? '<span class="muted small">geselecteerd</span>' : `<button class="btn ghost btn-sm" data-gen="${esc(x.key)}">Alleen deze</button>`}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  el.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => {
    const x = g.list.find((i) => i.key === /** @type {HTMLElement} */ (b).dataset.gen);
    if (x) run({ merk: f.merk, model: f.model, tgk: x.tgk, type: x.tgk ? '' : x.type, van: '', tot: '' });
  }));
}

/** Tabel "deze auto vs. gemiddelde". @param {VehicleSummary} self @param {ModelStats} st */
function comparisonTable(self, st) {
  /** lowerBetter: true = lager is beter, false = hoger is beter, null = neutraal */
  const row = (name, mine, theirs, fmt, lowerBetter) => {
    let cls = '';
    if (lowerBetter != null && mine != null && theirs != null && mine !== theirs) cls = (lowerBetter ? mine < theirs : mine > theirs) ? 'best' : 'worse';
    const diff = mine != null && theirs ? (mine - theirs) / theirs * 100 : null;
    return `<tr><td>${name}</td><td class="num ${cls}">${mine != null ? fmt(mine) : '–'}</td><td class="num">${theirs != null ? fmt(theirs) : '–'}</td>
      <td class="num muted">${diff != null && isFinite(diff) ? (diff > 0 ? '+' : '') + diff.toFixed(0) + '%' : ''}</td></tr>`;
  };
  const f = st.f;
  return `<section class="card"><h2>Deze auto vs. gemiddelde ${esc(st.label)}</h2>
    <div class="table-wrap"><table class="data compare"><thead><tr><th></th><th class="num">${esc(formatKenteken(self.kenteken))}</th><th class="num">Gemiddeld</th><th class="num">Verschil</th></tr></thead><tbody>
    ${row('Mankementen per APK', self.gebrekenPerKeuring, st.modelGpk, (x) => fmtNum(x, 2), true)}
    ${row('Aantal APK-keuringen', st.kPer[self.kenteken] ?? self.history.length, st.metKeuring ? st.totK / st.metKeuring : null, (x) => fmtNum(x, 1), null)}
    ${row('Catalogusprijs', num(self.v.catalogusprijs), st.prijs, fmtEuro, null)}
    ${row('Vermogen (kW)', self.kw, st.kw, (x) => fmtNum(x), false)}
    ${row('CO₂ (g/km)', self.co2, st.co2, (x) => fmtNum(x), true)}
    ${row('Verbruik (l/100km)', self.verbruik, st.verbruik, (x) => fmtNum(x, 1), true)}
    ${row('Massa rijklaar (kg)', num(self.v.massa_rijklaar), st.massa, (x) => fmtNum(x), null)}
    </tbody></table></div>
    <p class="small muted">Vergeleken met: ${esc([f.merk, f.model].join(' '))}, ${esc(f.groep || describePeerFilter(f))} (${fmtNum(st.total)} auto's). APK-gegevens uit een steekproef van ${st.others.length} kentekens.</p></section>`;
}

/** @param {HTMLElement} out @param {PeerFilter} f @param {VehicleSummary|null} self */
async function renderStats(out, f, self) {
  out.innerHTML = loading('Model analyseren…');
  const result = await computeModelStats(f, self);
  if ('error' in result) { out.innerHTML = errorBox(result.error); return; }
  if ('empty' in result) {
    out.innerHTML = '<section class="card"><p class="muted">Geen voertuigen gevonden voor deze zoekopdracht. Merk en model moeten exact overeenkomen met de RDW-schrijfwijze (bijv. "VOLKSWAGEN" en "GOLF").</p></section>';
    return;
  }
  const st = /** @type {ModelStats} */ (result);
  const defectItems = st.gebrekTop.error ? null : st.gebrekTop.map((g) => ({ name: (st.lookup[g.gebrek_identificatie] || {}).gebrek_omschrijving || g.gebrek_identificatie, n: num(g.n) || 0 }));
  out.innerHTML = `
    <div class="stats">
      ${statTile('Op kenteken', fmtNum(st.total), st.totalAll && st.totalAll !== st.total ? `${fmtNum(st.totalAll)} van dit model in totaal` : esc(st.label))}
      ${statTile('Gem. catalogusprijs', fmtEuro(st.prijs))}
      ${statTile('Mankementen per APK', st.modelGpk != null ? fmtNum(st.modelGpk, 1) : '', 'gemiddeld per keuring')}
      ${statTile('Altijd zonder mankementen', st.metKeuring ? Math.round(st.zonderGebreken / st.metKeuring * 100) + '%' : '', 'van de auto\'s')}
      ${statTile('APK verlopen', st.apkVerlopen.toFixed(1) + '%', 'in steekproef')}
      ${statTile('Open terugroepactie', st.terugroepPct.toFixed(1) + '%')}
      ${statTile('Geëxporteerd', st.exportPct.toFixed(1) + '%')}
      ${statTile('Kilometerstand onlogisch', st.onlogischPct.toFixed(1) + '%')}
    </div>
    ${self ? comparisonTable(self, st) : ''}
    <div class="grid-2">
      <section class="card"><h2>Wat vindt de APK het vaakst bij dit model?</h2><p class="sub">Bij ${esc(st.label)}, steekproef van ${st.others.length} auto's</p>
        ${defectItems ? barChart(defectItems) : errorBox(st.gebrekTop.error || '')}</section>
      <section class="card"><h2>Registraties per bouwjaar</h2><p class="sub">${esc([f.merk, f.model].filter(Boolean).join(' ').toUpperCase())}, alle jaren</p>${columnChart(st.jaarItems)}</section>
      <section class="card"><h2>Kleuren</h2>${barChart(st.kleurItems, { pct: true, total: st.total })}</section>
      <section class="card"><h2>Brandstof</h2>${barChart(st.fuelItems, { pct: true })}</section>
      <section class="card"><h2>Uitvoering / inrichting</h2>${barChart(st.inrichtingItems, { pct: true, total: st.sample.length })}</section>
      <section class="card"><h2>Motorvermogen</h2><p class="sub">Hoe sterk zijn de motoren van dit model?</p>${barChart(powerBuckets(st.fuelRows, self && self.pk), { pct: true })}</section>
    </div>
    <section class="card"><h2>Vergelijkbare auto's</h2><p class="sub">Klik op een kenteken om die auto te bekijken.</p>
      ${dataTable(st.sample.slice(0, 40).map((r) => ({ ...r, gebreken: st.gPer[r.kenteken] ?? '', keuringen: st.kPer[r.kenteken] ?? '' })),
        { keys: ['kenteken', 'handelsbenaming', 'datum_eerste_toelating', 'eerste_kleur', 'inrichting', 'catalogusprijs', 'vervaldatum_apk', 'keuringen', 'gebreken'] })}
    </section>`;
}
