/**
 * Client voor de RDW Open Data API (Socrata SODA). De API staat CORS toe, dus de
 * browser bevraagt hem rechtstreeks. Identieke verzoeken worden in het geheugen gecachet.
 * Query-taal: https://dev.socrata.com/docs/queries/
 */
import { RDW_APP_TOKEN, RDW_BASE } from '../config.js';
import { chunk } from '../lib/format.js';
import { DATASETS } from './datasets.js';

/** @typedef {import('./datasets.js').DatasetKey} DatasetKey */
/** @typedef {Record<string, string|number|undefined|null>} QueryParams */
/** @typedef {Record<string, any>} Row */

/** @type {Map<string, Promise<Row[]>>} */
const cache = new Map();

/** Tijdelijke serverfouten: één keer opnieuw proberen. */
const RETRY_STATUS = new Set([500, 502, 503, 504]);

/** @param {DatasetKey|string} key */
const datasetId = (key) => (DATASETS[/** @type {DatasetKey} */ (key)] || { id: key }).id;

/**
 * Bouwt de API-URL voor een dataset.
 * @param {DatasetKey|string} key datasetsleutel of Socrata-id
 * @param {QueryParams} [params]
 */
export function buildUrl(key, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&');
  return RDW_BASE + datasetId(key) + '.json' + (qs ? '?' + qs : '');
}

/**
 * Voert een query uit en geeft de rijen terug.
 * @param {DatasetKey|string} key
 * @param {QueryParams} [params] SoQL-parameters ($select, $where, $group, …)
 * @returns {Promise<Row[]>}
 */
export function query(key, params) {
  const url = buildUrl(key, params);
  const hit = cache.get(url);
  if (hit) return hit;
  const p = (async () => {
    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json' };
    if (RDW_APP_TOKEN) headers['X-App-Token'] = RDW_APP_TOKEN;
    let res = await fetch(url, { headers });
    if (RETRY_STATUS.has(res.status)) {
      await new Promise((r) => setTimeout(r, 800));
      res = await fetch(url, { headers });
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); if (j.message) msg += ' — ' + j.message; } catch { /* geen JSON */ }
      throw new Error(msg);
    }
    return res.json();
  })();
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

/**
 * Zoals `query`, maar geeft bij een fout `{ error }` terug in plaats van te gooien.
 * @param {DatasetKey|string} key @param {QueryParams} [params]
 * @returns {Promise<Row[] & {error?: string}>}
 */
export async function querySafe(key, params) {
  try { return await query(key, params); } catch (e) { return Object.assign([], { error: /** @type {Error} */ (e).message }); }
}

/**
 * Haalt rijen op voor (veel) kentekens tegelijk, in blokken om de URL kort te houden.
 * @param {DatasetKey} key @param {string[]} kentekens @param {QueryParams} [params]
 */
export async function queryByKentekens(key, kentekens, params = {}) {
  const parts = await Promise.all(chunk(kentekens, 300).map((ks) =>
    query(key, { ...params, $where: 'kenteken in' + inList(ks) + (params.$where ? ' AND ' + params.$where : ''), $limit: 50000 })));
  return parts.flat();
}

/** SoQL-tekstwaarde: lit("O'Neil") → 'O''Neil'. @param {unknown} v */
export const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";

/** SoQL-lijst voor `in`: ('A','B'). @param {unknown[]} values */
export const inList = (values) => '(' + values.map(lit).join(',') + ')';

/** SoQL-voorwaarden voor een bouwjaarbereik op datum_eerste_toelating. @param {number|string|null} [van] @param {number|string|null} [tot] */
export function yearRange(van, tot) {
  const parts = [];
  if (van) parts.push(`datum_eerste_toelating_dt>='${van}-01-01T00:00:00'`);
  if (tot) parts.push(`datum_eerste_toelating_dt<='${tot}-12-31T23:59:59'`);
  return parts;
}
