/**
 * Merken en modellen uit het RDW-register herkennen in een vrij getypte vraag.
 *
 * Bewust in kleine stappen, omdat query's over het hele register (alle merken of alle modellen
 * groeperen) tientallen seconden duren of een 500-fout geven:
 *  1. merk: ingebouwde lijst; alleen onbekende merken gericht in het register opzoeken,
 *  2. modellen per merk, pas als dat merk in de vraag voorkomt,
 *  3. modellen zonder merk ("golf 2015"): alleen de woorden uit de vraag opzoeken.
 */
import { inList, lit, query } from '../api/rdw-client.js';
import { normalizeText, num, titleCase } from '../lib/format.js';
import { cacheGet, cacheSet } from '../lib/storage.js';

/** Modellenlijsten veranderen nauwelijks: een week in de browser bewaren. */
const WEEK_MS = 7 * 24 * 3600 * 1000;

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

/**
 * Bekende merken (RDW-schrijfwijze), op volgorde van populariteit. Hiermee wordt een merk direct
 * herkend, zonder RDW-verzoek. Onbekende merken worden alsnog in het register opgezocht.
 */
export const KNOWN_MERKEN = ['VOLKSWAGEN', 'OPEL', 'PEUGEOT', 'RENAULT', 'TOYOTA', 'FORD', 'KIA', 'CITROEN', 'BMW',
  'MERCEDES-BENZ', 'AUDI', 'SKODA', 'VOLVO', 'NISSAN', 'HYUNDAI', 'FIAT', 'SEAT', 'MAZDA', 'SUZUKI', 'TESLA',
  'MINI', 'DACIA', 'MITSUBISHI', 'HONDA', 'LAND ROVER', 'JEEP', 'PORSCHE', 'ALFA ROMEO', 'LEXUS', 'SMART', 'DS',
  'MG', 'BYD', 'POLESTAR', 'CUPRA', 'SUBARU', 'CHEVROLET', 'JAGUAR', 'DAIHATSU', 'LANCIA', 'SAAB', 'CHRYSLER',
  'DODGE', 'LYNK & CO', 'MASERATI', 'FERRARI', 'LAMBORGHINI', 'BENTLEY', 'ROLLS ROYCE', 'ALPINE', 'ABARTH',
  'SSANGYONG', 'KGM', 'ISUZU', 'IVECO', 'MAN', 'DAF', 'SCANIA', 'XPENG', 'NIO', 'ZEEKR', 'LEAPMOTOR', 'ORA',
  'AIWAYS', 'GENESIS', 'INFINITI', 'CADILLAC', 'LINCOLN', 'ASTON MARTIN', 'MCLAREN', 'LOTUS', 'MORGAN', 'TRIUMPH',
  'ROVER', 'MG ROVER', 'DAEWOO', 'CHEVROLET DAEWOO', 'PIAGGIO', 'LIGIER', 'MICROCAR', 'AIXAM', 'VESPA', 'YAMAHA',
  'KAWASAKI', 'HARLEY-DAVIDSON', 'DUCATI', 'KTM', 'BMW I', 'SERES', 'JAECOO', 'OMODA', 'SMART #', 'FISKER',
].map((merk, i, all) => ({ merk, n: all.length - i }));

/** Woorden die nooit als merk/model herkend mogen worden. */
export const STOPWORDS = new Set(['en', 'van', 'de', 'het', 'een', 'met', 'voor', 'na', 'tot', 'per', 'apk', 'auto', 'autos',
  'model', 'modellen', 'nvt', 'n v t', 'onbekend', 'is', 'in', 'op', 'of', 'wat', 'welke', 'hoeveel', 'meest', 'zijn']);

/** Komt `key` als los woord (of woordgroep) voor in `text`? Beide genormaliseerd. */
export const containsWord = (text, key) => (' ' + text + ' ').includes(' ' + key + ' ');

/** Woorden en woordgroepen (1–3 woorden) uit een genormaliseerde tekst, zonder stopwoorden en jaartallen. @param {string} text */
function candidatePhrases(text) {
  const words = text.split(' ').filter((w) => w && w !== '§');
  const out = new Set();
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (phrase.length < 2 || STOPWORDS.has(phrase) || /^(19|20)\d\d$/.test(phrase) || !/[a-z]/.test(phrase)) continue;
      out.add(phrase.toUpperCase());
    }
  }
  return [...out].slice(0, 25);
}

/**
 * Zoekt een merk in de tekst: eerst in de ingebouwde lijst (direct), anders gericht in het register
 * (alleen de woorden uit de vraag, dus een lichte query).
 * @param {string} text genormaliseerde tekst
 * @returns {Promise<{merk: string, key: string}|null>}
 */
export async function findMerkInText(text) {
  const known = findMerk(KNOWN_MERKEN, text);
  if (known) return known;
  const cands = candidatePhrases(text);
  if (!cands.length) return null;
  const cacheKey = 'merk.' + cands.join('|');
  let found = cacheGet(cacheKey, WEEK_MS);
  if (!found) {
    try {
      const rows = await query('voertuig', { $select: 'merk, count(*) as n', $where: 'merk in' + inList(cands), $group: 'merk', $order: 'n DESC', $limit: 20 });
      found = rows.filter((r) => (num(r.n) || 0) >= 20).map((r) => ({ merk: r.merk, n: num(r.n) || 0 }));
      cacheSet(cacheKey, found);
    } catch { return null; }
  }
  return findMerk(found, text);
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
    const stored = cacheGet('models.' + merk, WEEK_MS);
    p = stored ? Promise.resolve(stored) : query('voertuig', { $select: 'handelsbenaming, count(*) as n', $where: 'merk=' + lit(merk), $group: 'handelsbenaming', $order: 'n DESC', $limit: 3000 })
      .then((rows) => {
        const models = toModels(rows.filter((r) => (num(r.n) || 0) >= 10).map((r) => ({ ...r, merk })));
        cacheSet('models.' + merk, models);
        return models;
      });
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
  const list = candidatePhrases(text);
  if (!list.length) return [];
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
