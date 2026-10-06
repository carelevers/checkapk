/** Ruwe RDW-gegevens van één voertuig omzetten naar een handige samenvatting. */
import { num, parseDate } from '../lib/format.js';

/** @typedef {import('../api/vehicle.js').VehicleData} VehicleData */
/**
 * @typedef {object} ApkEvent  Eén keuringsmoment (meldingen + gebreken op dezelfde dag)
 * @property {number} key            datum als yyyymmdd
 * @property {Date} date
 * @property {Record<string, any>[]} keuringen
 * @property {Record<string, any>[]} gebreken
 * @property {number} aantalGebreken
 */

/** Statussen van een terugroepactie die als afgehandeld gelden. */
const RECALL_DONE = /hersteld|afgesloten|uitgevoerd/i;

/** @param {Record<string, any>} r */
export const isRecallOpen = (r) => !RECALL_DONE.test(r.status || '');

/** @param {unknown} v @returns {number|null} yyyymmdd */
function dateKey(v) {
  const d = parseDate(v);
  return d ? d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() : null;
}

/**
 * Combineert keuringsmeldingen en gebreken per datum, nieuwste eerst.
 * @param {VehicleData} data @returns {ApkEvent[]}
 */
export function buildApkHistory(data) {
  /** @type {Map<number, any>} */
  const events = new Map();
  const at = (k) => {
    if (!events.has(k)) events.set(k, { key: k, keuringen: [], gebreken: [] });
    return events.get(k);
  };
  const when = (r) => dateKey(r.meld_datum_door_keuringsinstantie_dt || r.meld_datum_door_keuringsinstantie);
  for (const r of data.keuringen.rows) { const k = when(r); if (k) at(k).keuringen.push(r); }
  for (const r of data.gebreken.rows) { const k = when(r); if (k) at(k).gebreken.push(r); }
  return [...events.values()].sort((a, b) => b.key - a.key).map((e) => ({
    ...e,
    date: /** @type {Date} */ (parseDate(String(e.key))),
    aantalGebreken: e.gebreken.reduce((s, g) => s + (num(g.aantal_gebreken_geconstateerd) || 1), 0),
  }));
}

/**
 * @typedef {ReturnType<typeof summarizeVehicle>} VehicleSummary
 */

/**
 * Samenvatting van een voertuig met de waarden die overal in de site gebruikt worden.
 * @param {VehicleData} data
 */
export function summarizeVehicle(data) {
  const v = data.voertuig.rows[0] || {};
  const fuel = data.brandstof.rows;
  const history = buildApkHistory(data);
  const keuringen = history.filter((e) => e.keuringen.length).length || history.length;
  const totaalGebreken = history.reduce((s, e) => s + e.aantalGebreken, 0);
  const kw = Math.max(0, ...fuel.map((f) => num(f.nettomaximumvermogen) || num(f.netto_max_vermogen_elektrisch) || 0)) || null;
  const pick = (field) => { for (const f of fuel) if (f[field] != null && f[field] !== '') return f[field]; return null; };
  const toelating = parseDate(v.datum_eerste_toelating_dt || v.datum_eerste_toelating);
  return {
    /** Ruwe rij uit "Gekentekende voertuigen" */
    v,
    history,
    kenteken: /** @type {string} */ (v.kenteken),
    titel: [v.merk, v.handelsbenaming].filter(Boolean).join(' '),
    brandstof: [...new Set(fuel.map((f) => f.brandstof_omschrijving).filter(Boolean))].join(' + '),
    kw,
    pk: kw ? Math.round(kw * 1.35962) : null,
    co2: num(pick('co2_uitstoot_gecombineerd')) ?? num(pick('co2_uitstoot_gewogen')),
    verbruik: num(pick('brandstofverbruik_gecombineerd')),
    euroklasse: pick('emissiecode_omschrijving'),
    bereik: num(pick('actie_radius_enkel_elektrisch_wltp')),
    apk: parseDate(v.vervaldatum_apk_dt || v.vervaldatum_apk),
    toelating,
    bouwjaar: toelating ? toelating.getFullYear() : null,
    eigenaarSinds: parseDate(v.datum_tenaamstelling_dt || v.datum_tenaamstelling),
    keuringen,
    totaalGebreken,
    gebrekenPerKeuring: keuringen ? totaalGebreken / keuringen : null,
    terugroepOpen: data.terugroepStatus.rows.filter(isRecallOpen).length,
    terugroepTotaal: data.terugroepStatus.rows.length,
  };
}

/**
 * Groepeert vermogens tot leesbare klassen ("75 pk", "110 pk") voor een grafiek.
 * @param {Record<string, any>[]} fuelRows rijen uit dataset brandstof
 * @param {number|null} [highlightPk] dit vermogen wordt gemarkeerd
 */
export function powerBuckets(fuelRows, highlightPk) {
  /** @type {Record<number, number>} */
  const m = {};
  for (const r of fuelRows) {
    const kw = num(r.nettomaximumvermogen);
    if (!kw) continue;
    const pk = Math.round(kw * 1.35962 / 5) * 5;
    m[pk] = (m[pk] || 0) + 1;
  }
  const hl = highlightPk ? Math.round(highlightPk / 5) * 5 : null;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([pk, n]) => ({ name: pk + ' pk', n, hl: +pk === hl }));
}
