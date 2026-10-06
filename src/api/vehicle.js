/** Alle RDW-gegevens van één kenteken ophalen. */
import { normalizeKenteken } from '../domain/kenteken.js';
import { PER_KENTEKEN, RECALL_DETAILS } from './datasets.js';
import { inList, query } from './rdw-client.js';

/** @typedef {import('./rdw-client.js').Row} Row */
/** @typedef {{rows: Row[], error: string|null}} DatasetResult */
/** @typedef {Record<import('./datasets.js').DatasetKey, DatasetResult>} VehicleData */

/** @param {Promise<Row[]>} p @returns {Promise<DatasetResult>} */
const settle = (p) => p.then((rows) => ({ rows, error: null }), (e) => ({ rows: [], error: e.message }));

/**
 * Haalt alle datasets voor een kenteken op, plus gebrekomschrijvingen en terugroepdetails.
 * Een fout in één dataset breekt de rest niet; die staat dan in `error`.
 * @param {string} kenteken
 * @returns {Promise<VehicleData>}
 */
export async function fetchVehicle(kenteken) {
  const k = normalizeKenteken(kenteken);
  const entries = await Promise.all(PER_KENTEKEN.map(async (key) =>
    [key, await settle(query(key, { kenteken: k, $limit: 5000 }))]));
  const data = /** @type {VehicleData} */ (Object.fromEntries(entries));

  const ids = [...new Set(data.gebreken.rows.map((r) => r.gebrek_identificatie).filter(Boolean))];
  data.gebrekOmschrijving = ids.length
    ? await settle(query('gebrekOmschrijving', { $where: 'gebrek_identificatie in' + inList(ids), $limit: 5000 }))
    : { rows: [], error: null };

  const refs = [...new Set(data.terugroepStatus.rows.map((r) => r.referentiecode_rdw).filter(Boolean))];
  await Promise.all(RECALL_DETAILS.map(async (key) => {
    data[key] = refs.length
      ? await settle(query(key, { $where: 'referentiecode_rdw in' + inList(refs), $limit: 1000 }))
      : { rows: [], error: null };
  }));
  return data;
}
