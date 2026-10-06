/**
 * Voorbeeldfoto's van een automodel via Wikimedia Commons (gratis, CORS toegestaan).
 * De licenties vereisen naamsvermelding: elke foto bevat daarom maker en licentie.
 * API: https://www.mediawiki.org/wiki/API:Search
 */
import { titleCase } from '../lib/format.js';

const API = 'https://commons.wikimedia.org/w/api.php';

/** Merknamen zoals ze op Commons staan. */
const DISPLAY_MERK = { CITROEN: 'Citroën', SKODA: 'Škoda', 'MERCEDES-BENZ': 'Mercedes-Benz', BMW: 'BMW', MG: 'MG', DS: 'DS', BYD: 'BYD', 'LYNK & CO': 'Lynk & Co' };

/** Foto's van deze onderdelen zijn niet "de auto". */
const EXCLUDE = '-interior -interieur -dashboard -cockpit -engine -motor -badge -logo -emblem -wheel -seat -key -trunk -boot';

/**
 * @typedef {object} Photo
 * @property {string} thumb    URL ±640 px breed
 * @property {string} full     URL ±1600 px breed
 * @property {string} title    bestandsnaam zonder "File:" en extensie
 * @property {string} pageUrl  pagina op Commons (voor bron/licentie)
 * @property {string} artist   maker
 * @property {string} license  bijv. "CC BY-SA 4.0"
 */

/** HTML uit Commons-metadata halen ("<a>Jan</a>" → "Jan"). @param {string} [html] */
const plain = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** @param {string} search @param {number} limit @returns {Promise<Photo[]>} */
async function searchCommons(search, limit) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: String(limit), gsrsearch: `filetype:bitmap ${search} ${EXCLUDE}`,
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '640',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error('Commons gaf ' + res.status);
  const pages = Object.values((await res.json()).query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map((p) => {
    const ii = (p.imageinfo || [])[0];
    if (!ii || ii.width < 800 || ii.width < ii.height) return null;   // klein of staand: overslaan
    const meta = ii.extmetadata || {};
    return {
      thumb: ii.thumburl || ii.url,
      // Commons kan geen thumbnail groter dan het origineel maken: dan het origineel gebruiken
      full: ii.width > 1600 && ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, '/1600px-') : ii.url,
      title: String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
      pageUrl: ii.descriptionurl,
      artist: plain(meta.Artist?.value) || 'onbekend',
      license: plain(meta.LicenseShortName?.value) || 'zie bron',
    };
  }).filter(Boolean);
}

/** @type {Map<string, Promise<Photo[]>>} */
const cache = new Map();

/**
 * Zoekt foto's van een model; eerst met bouwjaar (meest kans op de juiste generatie), aangevuld zonder.
 * @param {{merk: string, model?: string, year?: number|null}} car  RDW-schrijfwijze, bijv. CITROEN / C3
 * @param {number} [limit=12]
 * @returns {Promise<Photo[]>} lege lijst als er niets gevonden wordt of Commons niet bereikbaar is
 */
export function findCarPhotos({ merk, model = '', year = null }, limit = 12) {
  const merkName = DISPLAY_MERK[merk] || titleCase(merk);
  const modelName = model.toUpperCase().startsWith(merk + ' ') ? model.slice(merk.length + 1) : model;
  const name = '"' + [merkName, titleCase(modelName)].filter(Boolean).join(' ') + '"';
  const key = `${name}|${year || ''}|${limit}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const seen = new Set();
      const out = [];
      const add = (list) => { for (const ph of list) if (!seen.has(ph.pageUrl) && out.length < limit) { seen.add(ph.pageUrl); out.push(ph); } };
      if (year) add(await searchCommons(`${name} ${year}`, 20).catch(() => []));
      if (out.length < limit) add(await searchCommons(name, 30).catch(() => []));
      return out;
    })();
    cache.set(key, p);
  }
  return p;
}
