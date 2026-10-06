/**
 * Merken en modellen uit het RDW-register herkennen in een vrij getypte vraag.
 *
 * Bewust in kleine stappen, omdat één grote "alle merken × modellen"-query te zwaar is voor de API:
 *  1. merkenlijst (één lichte query; bij een fout een ingebouwde lijst),
 *  2. modellen per merk, pas als dat merk in de vraag voorkomt,
 *  3. modellen zonder merk ("golf 2015"): alleen de woorden uit de vraag opzoeken.
 */
import { inList, lit, query } from '../api/rdw-client.js';
import { normalizeText, num, titleCase } from '../lib/format.js';

/**
 * @typedef {object} Subject  Een herkend merk, eventueel met model
 * @property {string} merk          RDW-schrijfwijze, bijv. "VOLKSWAGEN"
 * @property {string} [key]         genormaliseerde modelnaam zonder merk, bijv. "golf"
 * @property {string[]} [variants]  alle RDW-schrijfwijzen van dit model (bijv. "208" en "PEUGEOT 208")
 * @property {number} [n]           aantal op kenteken
 */
/** @typedef {{merk: string, n: number}} Merk */

/** Alternatieve schrijfwijzen → RDW-merknaam. Uitbreiden kan gewoon hier. */
export const MERK_ALIASES = {
  vw: 'VOLKSWAGEN', volkswagen: 'VOLKSWAGEN', mercedes: 'MERCEDES-BENZ', merc: 'MERCEDES-BENZ', benz: 'MERCEDES-BENZ',
  'mercedes benz': 'MERCEDES-BENZ', alfa: 'ALFA ROMEO', 'land rover': 'LAND ROVER', landrover: 'LAND ROVER',
  chevy: 'CHEVROLET', citroen: 'CITROEN', skoda: 'SKODA', 'rolls royce': 'ROLLS ROYCE',
};

/** Vangnet als de merkenlijst niet opgehaald kan worden (RDW-schrijfwijze). */
const FALLBACK_MERKEN = ['VOLKSWAGEN', 'OPEL', 'PEUGEOT', 'RENAULT', 'TOYOTA', 'FORD', 'KIA', 'CITROEN', 'BMW',
  'MERCEDES-BENZ', 'AUDI', 'SKODA', 'VOLVO', 'NISSAN', 'HYUNDAI', 'FIAT', 'SEAT', 'MAZDA', 'SUZUKI', 'TESLA',
  'MINI', 'DACIA', 'MITSUBISHI', 'HONDA', 'LAND ROVER', 'JEEP', 'PORSCHE', 'ALFA ROMEO', 'LEXUS', 'SMART', 'DS',
  'MG', 'BYD', 'POLESTAR', 'CUPRA', 'SUBARU', 'CHEVROLET', 'JAGUAR', 'DAIHATSU', 'LANCIA', 'SAAB', 'CHRYSLER',
  'DODGE', 'LYNK & CO', 'MASERATI', 'FERRARI', 'LAMBORGHINI', 'BENTLEY', 'ROLLS ROYCE', 'ALPINE', 'ABARTH',
  'SSANGYONG', 'ISUZU', 'IVECO', 'MAN', 'DAF', 'SCANIA', 'XPENG', 'NIO', 'ZEEKR', 'LEAPMOTOR', 'ORA'];

/** Woorden die nooit als merk/model herkend mogen worden. */
export const STOPWORDS = new Set(['en', 'van', 'de', 'het', 'een', 'met', 'voor', 'na', 'tot', 'per', 'apk', 'auto', 'autos',
  'model', 'modellen', 'nvt', 'n v t', 'onbekend', 'is', 'in', 'op', 'of', 'wat', 'welke', 'hoeveel', 'meest', 'zijn']);

/** Komt `key` als los woord (of woordgroep) voor in `text`? Beide genormaliseerd. */
export const containsWord = (text, key) => (' ' + text + ' ').includes(' ' + key + ' ');

/** @type {Promise<Merk[]>|null} */
let merkenPromise = null;

/** Alle merken met het aantal auto's; valt terug op een ingebouwde lijst. */
export function getMerken() {
  if (!merkenPromise) {
    merkenPromise = query('voertuig', { $select: 'merk, count(*) as n', $group: 'merk', $order: 'n DESC', $limit: 2000 })
      .then((rows) => rows.filter((r) => r.merk).map((r) => ({ merk: r.merk, n: num(r.n) || 0 })))
      .catch(() => FALLBACK_MERKEN.map((merk, i) => ({ merk, n: FALLBACK_MERKEN.length - i })));
  }
  return merkenPromise;
}

/**
 * Zet RDW-rijen {merk, handelsbenaming, n} om naar modellen; schrijfwijzen met en zonder
 * merknaam ("208" en "PEUGEOT 208") worden samengevoegd.
 * @param {Record<string, any>[]} rows @returns {Required<Subject>[]}
 */
function toModels(rows) {
  /** @type {Record<string, Required<Subject>>} */
  const models = {};
  for (const r of rows) {
    if (!r.merk || !r.handelsbenaming) continue;
    const mk = normalizeText(r.merk);
    let key = normalizeText(r.handelsbenaming);
    if (key.startsWith(mk + ' ')) key = key.slice(mk.length + 1);
    if (!key) continue;
    const id = r.merk + '|' + key;
    models[id] = models[id] || { merk: r.merk, key, variants: [], n: 0 };
    models[id].variants.push(r.handelsbenaming);
    models[id].n += num(r.n) || 0;
  }
  return Object.values(models).sort((a, b) => b.n - a.n);
}

/** @type {Map<string, Promise<Required<Subject>[]>>} */
const modelsCache = new Map();

/** Modellen van één merk (minstens 10 op kenteken, om tikfouten in het register over te slaan). @param {string} merk */
export function modelsOfMerk(merk) {
  let p = modelsCache.get(merk);
  if (!p) {
    p = query('voertuig', { $select: 'handelsbenaming, count(*) as n', $where: 'merk=' + lit(merk), $group: 'handelsbenaming', $order: 'n DESC', $limit: 3000 })
      .then((rows) => toModels(rows.filter((r) => (num(r.n) || 0) >= 10).map((r) => ({ ...r, merk }))));
    p.catch(() => modelsCache.delete(merk));
    modelsCache.set(merk, p);
  }
  return p;
}

/**
 * Zoekt modellen zonder bekend merk, door alleen woorden en woordgroepen uit de vraag op te zoeken.
 * @param {string} text genormaliseerde tekst @returns {Promise<Required<Subject>[]>}
 */
export async function findModelsByWords(text) {
  const words = text.split(' ').filter((w) => w && w !== '§');
  const cands = new Set();
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (phrase.length < 2 || STOPWORDS.has(phrase) || /^(19|20)\d\d$/.test(phrase) || !/[a-z]/.test(phrase)) continue;
      cands.add(phrase.toUpperCase());
    }
  }
  if (!cands.size) return [];
  const list = [...cands].slice(0, 25);
  const rows = await query('voertuig', {
    $select: 'merk, handelsbenaming, count(*) as n', $where: 'handelsbenaming in' + inList(list),
    $group: 'merk, handelsbenaming', $order: 'n DESC', $limit: 200,
  });
  return toModels(rows.filter((r) => (num(r.n) || 0) >= 100));
}

/**
 * Zoekt het (langste) merk in een genormaliseerde tekst.
 * @param {Merk[]} merken @param {string} text
 * @returns {{merk: string, key: string}|null} key = het gevonden stukje tekst
 */
export function findMerk(merken, text) {
  for (const [alias, merk] of Object.entries(MERK_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
    if (containsWord(text, alias) && merken.some((m) => m.merk === merk)) return { merk, key: alias };
  }
  const hits = merken
    .filter((m) => { const k = normalizeText(m.merk); return k.length >= 2 && !STOPWORDS.has(k) && containsWord(text, k); })
    .sort((a, b) => normalizeText(b.merk).length - normalizeText(a.merk).length || b.n - a.n);
  return hits.length ? { merk: hits[0].merk, key: normalizeText(hits[0].merk) } : null;
}

/** Leesbare naam: "Volkswagen Golf". @param {Subject} s */
export function subjectLabel(s) {
  if (!s.key || !s.variants) return titleCase(s.merk);
  return titleCase(s.merk) + ' ' + titleCase(s.variants[0].toUpperCase().replace(s.merk + ' ', ''));
}
