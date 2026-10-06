/** Eenvoudige tabbladen van de kentekenpagina (alles behalve rapport en vergelijking). */
import { DATASETS, RECALL_DETAILS } from '../../api/datasets.js';
import { defectName, defectLookup } from '../../domain/defects.js';
import { formatKenteken } from '../../domain/kenteken.js';
import { isRecallOpen } from '../../domain/vehicle-summary.js';
import { ageText, daysBetween, fmtDate, fmtEuro, fmtNum, num } from '../../lib/format.js';
import { barChart, columnChart } from '../../ui/charts.js';
import { dataTable, errorBox, esc, keyValueList, statTile } from '../../ui/html.js';
import { apkTimelineHtml } from './apk-timeline.js';

/** @typedef {{s: import('../../domain/vehicle-summary.js').VehicleSummary, data: import('../../api/vehicle.js').VehicleData}} TabContext */

/** @param {TabContext} ctx */
export function overviewTab({ s, data }) {
  const v = s.v;
  const last = s.history[0];
  return `
    <div class="stats">
      ${statTile('Leeftijd', s.toelating ? esc(ageText(s.toelating)) : '', s.toelating ? 'sinds ' + fmtDate(s.toelating) : '')}
      ${statTile('Vermogen', s.kw ? `${fmtNum(s.pk)} pk` : '', s.kw ? fmtNum(s.kw) + ' kW' : '')}
      ${statTile('Catalogusprijs', fmtEuro(v.catalogusprijs), v.bruto_bpm ? 'BPM ' + fmtEuro(v.bruto_bpm) : '')}
      ${statTile('Gewicht', v.massa_rijklaar ? fmtNum(v.massa_rijklaar) + ' kg' : '', v.cilinderinhoud ? fmtNum(v.cilinderinhoud) + ' cc' : '')}
      ${statTile('Op naam sinds', s.eigenaarSinds ? fmtDate(s.eigenaarSinds) : '', s.eigenaarSinds ? esc(ageText(s.eigenaarSinds)) : '')}
      ${statTile('APK-keuringen', fmtNum(s.history.length), last ? 'laatste ' + fmtDate(last.date) : '')}
      ${statTile('Mankementen bij APK', fmtNum(s.totaalGebreken), s.gebrekenPerKeuring != null ? fmtNum(s.gebrekenPerKeuring, 1) + ' per keuring' : '')}
      ${statTile('CO₂', s.co2 != null ? fmtNum(s.co2) + ' g/km' : '', s.euroklasse ? 'Euro ' + esc(s.euroklasse) : '')}
    </div>
    <div class="grid-2">
      <section class="card"><h2>Voertuig</h2>${keyValueList(v, ['merk', 'handelsbenaming', 'voertuigsoort', 'inrichting', 'eerste_kleur', 'tweede_kleur',
        'aantal_zitplaatsen', 'aantal_deuren', 'datum_eerste_toelating', 'datum_eerste_tenaamstelling_in_nederland', 'datum_tenaamstelling',
        'vervaldatum_apk', 'zuinigheidsclassificatie', 'catalogusprijs', 'bruto_bpm'])}</section>
      <section class="card"><h2>Laatste APK-keuringen</h2>${apkTimelineHtml(s.history.slice(0, 4), data)}
        ${s.history.length > 4 ? `<p><a href="#" data-goto="apk">Alle keuringen (${s.history.length}) →</a></p>` : ''}</section>
    </div>`;
}

/** @param {TabContext} ctx */
export function apkTab({ s, data }) {
  const lookup = defectLookup(data.gebrekOmschrijving.rows);
  /** @type {Record<number, number>} */ const perYear = {};
  /** @type {Record<string, number>} */ const perDefect = {};
  for (const e of s.history) {
    const y = e.date.getFullYear();
    perYear[y] = (perYear[y] || 0) + e.aantalGebreken;
    for (const g of e.gebreken) perDefect[g.gebrek_identificatie] = (perDefect[g.gebrek_identificatie] || 0) + (num(g.aantal_gebreken_geconstateerd) || 1);
  }
  const years = Object.keys(perYear).map(Number).sort();
  const yearItems = years.length
    ? Array.from({ length: years[years.length - 1] - years[0] + 1 }, (_, i) => years[0] + i).map((y) => ({ x: String(y), n: perYear[y] || 0 }))
    : [];
  const topDefects = Object.entries(perDefect).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ name: defectName(lookup, id), n }));
  const withDefects = s.history.filter((e) => e.aantalGebreken > 0).length;
  const daysLeft = s.apk ? daysBetween(new Date(), s.apk) : null;
  return `
    <div class="stats">
      ${statTile('APK geldig tot', s.apk ? fmtDate(s.apk) : '', daysLeft == null ? '' : daysLeft >= 0 ? `nog ${daysLeft} dagen` : 'verlopen')}
      ${statTile('Keuringen', fmtNum(s.history.length))}
      ${statTile('Met mankementen', fmtNum(withDefects), s.history.length ? Math.round(withDefects / s.history.length * 100) + '% van de keuringen' : '')}
      ${statTile('Mankementen totaal', fmtNum(s.totaalGebreken), s.gebrekenPerKeuring != null ? fmtNum(s.gebrekenPerKeuring, 1) + ' per keuring' : '')}
      ${statTile('Kilometerstand', esc(s.v.tellerstandoordeel || ''), s.v.jaar_laatste_registratie_tellerstand ? 'laatst geregistreerd ' + esc(s.v.jaar_laatste_registratie_tellerstand) : '')}
    </div>
    <div class="grid-2">
      <section class="card"><h2>Mankementen per jaar</h2>${columnChart(yearItems)}</section>
      <section class="card"><h2>Wat werd het vaakst gevonden?</h2>${barChart(topDefects)}</section>
    </div>
    <section class="card"><h2>Alle keuringen</h2>
      <p class="sub">Elke APK-keuring met wat er gevonden is. Nieuwste bovenaan.</p>
      ${apkTimelineHtml(s.history, data)}
      ${data.keuringen.error ? errorBox('Keuringen: ' + data.keuringen.error) : ''}
      ${data.gebreken.error ? errorBox('Gebreken: ' + data.gebreken.error) : ''}
    </section>`;
}

/** @param {TabContext} ctx */
export function recallsTab({ data }) {
  const status = data.terugroepStatus.rows;
  if (!status.length) {
    return `<section class="card"><h2>Terugroepacties</h2><p class="muted">Geen terugroepacties bekend voor dit voertuig.</p>
      ${data.terugroepStatus.error ? errorBox(data.terugroepStatus.error) : ''}</section>`;
  }
  const byRef = RECALL_DETAILS.map((key) => Object.fromEntries(data[key].rows.map((r) => [r.referentiecode_rdw, r])));
  return status.map((st) => {
    const ref = st.referentiecode_rdw;
    const detail = Object.assign({}, ...byRef.map((m) => m[ref] || {}));
    return `<section class="card"><h2>${esc(ref || 'Terugroepactie')} <span class="badge ${isRecallOpen(st) ? 'bad' : 'ok'}">${esc(st.status || st.code_status || '')}</span></h2>
      ${keyValueList(detail)}</section>`;
  }).join('');
}

/** @param {TabContext} ctx */
export function fuelTab({ data }) {
  const rows = data.brandstof.rows;
  if (!rows.length) return '<section class="card"><p class="muted">Geen brandstofgegevens.</p></section>';
  return rows.map((r) => `<section class="card"><h2>${esc(r.brandstof_omschrijving || 'Brandstof')}</h2>${keyValueList(r)}</section>`).join('');
}

/** @param {TabContext} ctx */
export function specsTab({ data }) {
  const v = data.voertuig.rows[0] || {};
  const section = (title, key) => {
    const rows = data[key].rows;
    if (!rows.length) return '';
    return `<section class="card"><h2>${esc(title)}</h2>${rows.length === 1 ? keyValueList(rows[0]) : dataTable(rows)}</section>`;
  };
  return `<section class="card"><h2>Afmetingen & gewichten</h2>${keyValueList(v, ['lengte', 'breedte', 'hoogte_voertuig', 'wielbasis',
      'massa_ledig_voertuig', 'massa_rijklaar', 'toegestane_maximum_massa_voertuig', 'maximum_massa_trekken_ongeremd',
      'maximum_trekken_massa_geremd', 'aantal_cilinders', 'cilinderinhoud', 'vermogen_massarijklaar', 'aantal_wielen',
      'europese_voertuigcategorie', 'typegoedkeuringsnummer', 'variant', 'uitvoering', 'plaats_chassisnummer'])}</section>
    ${section('Carrosserie', 'carrosserie')}${section('Carrosserie specificatie', 'carrosserieSpec')}
    ${section('Voertuigklasse', 'voertuigklasse')}${section('Subcategorie', 'subcategorie')}
    ${section('Assen', 'assen')}${section('Bijzonderheden', 'bijzonderheden')}`;
}

/** Alle ruwe gegevens per dataset. @param {TabContext} ctx */
export function rawDataTab({ s, data }) {
  return Object.entries(data).map(([key, d]) => {
    const ds = DATASETS[/** @type {keyof typeof DATASETS} */ (key)];
    if (!ds) return '';
    return `<section class="card"><h2>${esc(ds.titel)} <span class="muted small">(${d.rows.length})</span></h2>
      <p class="sub"><a href="https://opendata.rdw.nl/d/${ds.id}" target="_blank" rel="noopener">${ds.id}</a></p>
      ${d.error ? errorBox(d.error) : dataTable(d.rows, { empty: 'Geen records voor ' + formatKenteken(s.kenteken) })}</section>`;
  }).join('');
}
