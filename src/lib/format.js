/** Opmaak- en rekenhulpjes zonder afhankelijkheden. */

const DAY_MS = 86400000;
const YEAR_MS = 365.25 * DAY_MS;

/**
 * RDW levert datums als "20230512", 20230512 of "2023-05-12T00:00:00.000".
 * @param {unknown} v
 * @returns {Date|null}
 */
export function parseDate(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

/** @param {unknown} v @returns {string} bijv. "12 mrt 2025" */
export function fmtDate(v) {
  const d = v instanceof Date ? v : parseDate(v);
  if (!d || isNaN(+d)) return v == null ? '' : String(v);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** @param {unknown} v @returns {number|null} */
export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** @param {unknown} v @param {number} [digits=0] */
export function fmtNum(v, digits = 0) {
  const n = num(v);
  if (n == null) return '';
  return n.toLocaleString('nl-NL', { maximumFractionDigits: digits });
}

/** @param {unknown} v */
export function fmtEuro(v) {
  const n = num(v);
  if (n == null) return '';
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** Rapportcijfer met komma: 7.7 → "7,7". @param {number} x */
export const fmtScore = (x) => x.toFixed(1).replace('.', ',');

/** @param {Date} a @param {Date} b */
export const daysBetween = (a, b) => Math.round((+b - +a) / DAY_MS);

/** Leeftijd in jaren (met decimalen) tussen een datum en nu. @param {Date|null} d */
export const yearsSince = (d) => (d ? (Date.now() - +d) / YEAR_MS : null);

/** @param {Date|null} d @returns {string} bijv. "10 jaar en 5 mnd" */
export function ageText(d) {
  if (!d) return '';
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months--;
  const y = Math.floor(months / 12), m = months % 12;
  return (y ? y + ' jaar' : '') + (y && m ? ' en ' : '') + (m ? m + ' mnd' : '') || '< 1 mnd';
}

/** "VOLKSWAGEN GOLF" → "Volkswagen Golf" (afkortingen als BMW blijven hoofdletters). @param {unknown} s */
export function titleCase(s) {
  return String(s || '').toLowerCase()
    .replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Bmw|Vw|Mg|Ds|Byd|Gt|Gti|Suv|Ev)\b/g, (w) => w.toUpperCase());
}

/** Kleine letters, zonder accenten en leestekens: "Citroën C3!" → "citroen c3". @param {unknown} s */
export function normalizeText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** @param {number} x @param {number} lo @param {number} hi */
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** @param {number} x */
export const round1 = (x) => Math.round(x * 10) / 10;

/** Gemiddelde, waarbij null/undefined genegeerd wordt. @param {(number|null|undefined)[]} arr */
export function average(arr) {
  const a = /** @type {number[]} */ (arr.filter((x) => x != null));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

/** Splits een lijst in blokken van `size`. @template T @param {T[]} arr @param {number} size @returns {T[][]} */
export const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

/** Telt waarden en geeft ze gesorteerd terug als [{name, n}]. @param {unknown[]} values */
export function countBy(values) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const v of values) if (v != null && v !== '') m[String(v)] = (m[String(v)] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
}
