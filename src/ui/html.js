/** Basisonderdelen voor HTML: escapen, sleutel/waarde-lijsten, tabellen, tegels en meldingen. */
import { formatKenteken } from '../domain/kenteken.js';
import { fmtDate, fmtEuro } from '../lib/format.js';

/** Escapet tekst voor veilig gebruik in HTML. Gebruik dit voor álle data uit de API. @param {unknown} v */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Leesbare labels voor bekende RDW-velden; onbekende velden worden automatisch opgemaakt. */
const LABELS = {
  kenteken: 'Kenteken', voertuigsoort: 'Voertuigsoort', merk: 'Merk', handelsbenaming: 'Model',
  vervaldatum_apk: 'APK vervaldatum', datum_tenaamstelling: 'Laatste tenaamstelling',
  bruto_bpm: 'Bruto BPM', inrichting: 'Inrichting', aantal_zitplaatsen: 'Zitplaatsen',
  eerste_kleur: 'Kleur', tweede_kleur: 'Tweede kleur', aantal_cilinders: 'Cilinders',
  cilinderinhoud: 'Cilinderinhoud (cc)', massa_ledig_voertuig: 'Massa leeg (kg)',
  toegestane_maximum_massa_voertuig: 'Max. massa (kg)', massa_rijklaar: 'Massa rijklaar (kg)',
  maximum_massa_trekken_ongeremd: 'Trekgewicht ongeremd (kg)', maximum_trekken_massa_geremd: 'Trekgewicht geremd (kg)',
  datum_eerste_toelating: 'Eerste toelating', datum_eerste_tenaamstelling_in_nederland: 'Eerste tenaamstelling NL',
  wacht_op_keuren: 'Wacht op keuren', catalogusprijs: 'Catalogusprijs', wam_verzekerd: 'WAM verzekerd',
  aantal_deuren: 'Deuren', aantal_wielen: 'Wielen', lengte: 'Lengte (cm)', breedte: 'Breedte (cm)',
  hoogte_voertuig: 'Hoogte (cm)', wielbasis: 'Wielbasis (cm)', europese_voertuigcategorie: 'EU-categorie',
  typegoedkeuringsnummer: 'Typegoedkeuring', variant: 'Variant', uitvoering: 'Uitvoering',
  vermogen_massarijklaar: 'Vermogen/massa (kW/kg)', export_indicator: 'Geëxporteerd',
  openstaande_terugroepactie_indicator: 'Openstaande terugroepactie', taxi_indicator: 'Taxi',
  jaar_laatste_registratie_tellerstand: 'Laatste tellerstandregistratie (jaar)',
  tellerstandoordeel: 'Tellerstandoordeel', code_toelichting_tellerstand: 'Toelichting tellerstand',
  tenaamstellen_mogelijk: 'Tenaamstellen mogelijk', zuinigheidsclassificatie: 'Energielabel',
  plaats_chassisnummer: 'Plaats chassisnummer', type: 'Type', massa_bedrijfsklaar_maximaal: 'Massa bedrijfsklaar max (kg)',
  brandstof_omschrijving: 'Brandstof', nettomaximumvermogen: 'Vermogen (kW)',
  brandstofverbruik_gecombineerd: 'Verbruik gecombineerd (l/100km)', brandstofverbruik_stad: 'Verbruik stad (l/100km)',
  brandstofverbruik_buiten: 'Verbruik buiten (l/100km)', co2_uitstoot_gecombineerd: 'CO₂ (g/km)',
  co2_uitstoot_gewogen: 'CO₂ gewogen (g/km)', geluidsniveau_stationair: 'Geluid stationair (dB)',
  geluidsniveau_rijdend: 'Geluid rijdend (dB)', emissiecode_omschrijving: 'Euroklasse',
  milieuklasse_eg_goedkeuring_licht: 'Milieuklasse', uitlaatemissieniveau: 'Uitlaatemissieniveau',
  roetuitstoot: 'Roetuitstoot', elektrisch_verbruik_enkel_elektrisch_wltp: 'Elektrisch verbruik WLTP (Wh/km)',
  actie_radius_enkel_elektrisch_wltp: 'Actieradius WLTP (km)', netto_max_vermogen_elektrisch: 'Vermogen elektrisch (kW)',
  brandstof_volgnummer: 'Volgnummer', meld_datum_door_keuringsinstantie: 'Meldingsdatum',
  meld_tijd_door_keuringsinstantie: 'Meldingstijd', soort_erkenning_keuringsinstantie: 'Soort erkenning (code)',
  soort_erkenning_omschrijving: 'Soort erkenning', soort_melding_ki_omschrijving: 'Soort melding',
  vervaldatum_keuring: 'Vervaldatum keuring', gebrek_identificatie: 'Gebrekcode',
  aantal_gebreken_geconstateerd: 'Aantal', gebrek_omschrijving: 'Omschrijving',
  referentiecode_rdw: 'Referentie RDW', code_status: 'Statuscode', status: 'Status',
};

/** @param {string} key RDW-veldnaam */
export function fieldLabel(key) {
  if (LABELS[key]) return LABELS[key];
  const s = key.replace(/_dt$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Waarde van een RDW-veld leesbaar maken (datums, bedragen). @param {string} key @param {unknown} v */
export function fieldValue(key, v) {
  if (v == null || v === '') return '';
  if (/datum/.test(key) || /_dt$/.test(key)) return fmtDate(v);
  if (key === 'catalogusprijs' || key === 'bruto_bpm') return fmtEuro(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Velden om te tonen: zonder *_dt-dubbelingen, api-links en Socrata-metavelden. @param {Record<string, any>} row */
export function visibleKeys(row) {
  return Object.keys(row).filter((k) => {
    if (/^api_/.test(k) || k.startsWith(':')) return false;
    return !(/_dt$/.test(k) && k.replace(/_dt$/, '') in row);
  });
}

/** Sleutel/waarde-lijst. @param {Record<string, any>} row @param {string[]} [keys] */
export function keyValueList(row, keys) {
  const items = (keys || visibleKeys(row)).filter((k) => row[k] != null && row[k] !== '')
    .map((k) => `<dt>${esc(fieldLabel(k))}</dt><dd>${esc(fieldValue(k, row[k]))}</dd>`).join('');
  return items ? `<dl class="kv">${items}</dl>` : '<p class="muted">Geen gegevens.</p>';
}

/**
 * Tabel van RDW-rijen; een kolom "kenteken" wordt een link naar de kentekenpagina.
 * @param {Record<string, any>[]} rows @param {{keys?: string[], empty?: string}} [opts]
 */
export function dataTable(rows, opts = {}) {
  if (!rows || !rows.length) return `<p class="muted">${esc(opts.empty || 'Geen gegevens.')}</p>`;
  const keys = opts.keys || [...new Set(rows.flatMap(visibleKeys))];
  const head = keys.map((k) => `<th>${esc(fieldLabel(k))}</th>`).join('');
  const body = rows.map((r) => '<tr>' + keys.map((k) => (k === 'kenteken' && r[k]
    ? `<td><a href="#/k/${esc(r[k])}">${esc(formatKenteken(r[k]))}</a></td>`
    : `<td>${esc(fieldValue(k, r[k]))}</td>`)).join('') + '</tr>').join('');
  return `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * Statistiektegel. `value` en `hint` worden NIET ge-escaped (mogen opmaak bevatten); escape zelf data.
 * @param {string} label @param {string} value @param {string} [hint]
 */
export function statTile(label, value, hint) {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${value || '–'}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

/** @param {string} [text] */
export const loading = (text = 'Laden…') => `<div class="loading"><div class="spinner"></div>${esc(text)}</div>`;

/** @param {string} msg */
export const errorBox = (msg) => `<div class="error">${esc(msg)}</div>`;


