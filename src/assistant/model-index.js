/**
 * Index van alle merken en modellen in het RDW-register (één query, daarna in het geheugen).
 * Wordt gebruikt om merken en modellen in een vrij getypte vraag te herkennen.
 */
import { query } from '../api/rdw-client.js';
import { normalizeText, num, titleCase } from '../lib/format.js';

/**
 * @typedef {object} Subject  Een herkend merk, eventueel met model
 * @property {string} merk          RDW-schrijfwijze, bijv. "VOLKSWAGEN"
 * @property {string} [key]         genormaliseerde modelnaam zonder merk, bijv. "golf"
 * @property {string[]} [variants]  alle RDW-schrijfwijzen van dit model (bijv. "208" en "PEUGEOT 208")
 * @property {number} [n]           aantal op kenteken
 */

/** Alternatieve schrijfwijzen → RDW-merknaam. Uitbreiden kan gewoon hier. */
export const MERK_ALIASES = {
  vw: 'VOLKSWAGEN', volkswagen: 'VOLKSWAGEN', mercedes: 'MERCEDES-BENZ', merc: 'MERCEDES-BENZ', benz: 'MERCEDES-BENZ',
  'mercedes benz': 'MERCEDES-BENZ', alfa: 'ALFA ROMEO', 'land rover': 'LAND ROVER', landrover: 'LAND ROVER',
  chevy: 'CHEVROLET', citroen: 'CITROEN', skoda: 'SKODA', 'rolls royce': 'ROLLS ROYCE',
};

/** Woorden die nooit als merk/model herkend mogen worden. */
export const STOPWORDS = new Set(['en', 'van', 'de', 'het', 'een', 'met', 'voor', 'na', 'tot', 'per', 'apk', 'auto', 'autos', 'model', 'nvt', 'n v t', 'onbekend']);

/** Komt `key` als los woord (of woordgroep) voor in `text`? Beide genormaliseerd. */
export const containsWord = (text, key) => (' ' + text + ' ').includes(' ' + key + ' ');

/** @type {Promise<{merken: {merk: string, n: number}[], models: Required<Subject>[]}>|null} */
let indexPromise = null;

/** Laadt de index (modellen met minstens 100 auto's op kenteken). */
export function getModelIndex() {
  if (!indexPromise) {
    indexPromise = query('voertuig', {
      $select: 'merk, handelsbenaming, count(*) as n', $group: 'merk, handelsbenaming',
      $having: 'count(*) >= 100', $order: 'n DESC', $limit: 50000,
    }).then((rows) => {
      const merken = {}, models = {};
      for (const r of rows) {
        if (!r.merk) continue;
        const n = num(r.n) || 0;
        const mk = normalizeText(r.merk);
        merken[mk] = merken[mk] || { merk: r.merk, n: 0 };
        merken[mk].n += n;
        if (!r.handelsbenaming) continue;
        let key = normalizeText(r.handelsbenaming);
        if (key.startsWith(mk + ' ')) key = key.slice(mk.length + 1);   // "PEUGEOT 208" → "208"
        if (!key) continue;
        const id = r.merk + '|' + key;
        models[id] = models[id] || { merk: r.merk, key, variants: [], n: 0 };
        models[id].variants.push(r.handelsbenaming);
        models[id].n += n;
      }
      return { merken: Object.values(merken), models: Object.values(models) };
    }).catch((e) => { indexPromise = null; throw e; });
  }
  return indexPromise;
}

/** @param {string} merk */
export async function modelsOfMerk(merk) {
  return (await getModelIndex()).models.filter((m) => m.merk === merk);
}

/**
 * Zoekt het (langste) merk in een genormaliseerde tekst.
 * @param {{merken: {merk: string, n: number}[]}} index @param {string} text
 * @returns {{merk: string, key: string}|null} key = het gevonden stukje tekst
 */
export function findMerk(index, text) {
  for (const [alias, merk] of Object.entries(MERK_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
    if (containsWord(text, alias) && index.merken.some((m) => m.merk === merk)) return { merk, key: alias };
  }
  const hits = index.merken
    .filter((m) => { const k = normalizeText(m.merk); return k.length >= 2 && !STOPWORDS.has(k) && containsWord(text, k); })
    .sort((a, b) => normalizeText(b.merk).length - normalizeText(a.merk).length || b.n - a.n);
  return hits.length ? { merk: hits[0].merk, key: normalizeText(hits[0].merk) } : null;
}

/** Leesbare naam: "Volkswagen Golf". @param {Subject} s */
export function subjectLabel(s) {
  if (!s.key || !s.variants) return titleCase(s.merk);
  return titleCase(s.merk) + ' ' + titleCase(s.variants[0].toUpperCase().replace(s.merk + ' ', ''));
}
