/** Laag 1 van "Vraag het": vragen herkennen met regels (werkt altijd, zonder AI). */
import { normalizeText } from '../lib/format.js';
import { containsWord, findMerkInText, findModelsByWords, modelsOfMerk } from './model-index.js';

/** @typedef {import('./model-index.js').Subject} Subject */
/**
 * @typedef {object} Plan  Wat er gevraagd wordt
 * @property {Subject[]} subjects
 * @property {number|null} van
 * @property {number|null} tot
 * @property {string[]} topics  sleutels uit TOPIC_LABELS
 * @property {string} [via]     'zoekbalk' of 'AI'
 */

/** Onderwerpen en de woorden waaraan ze herkend worden. */
const TOPIC_PATTERNS = /** @type {[string, RegExp][]} */ ([
  ['mankementen', /mankement|gebrek|afkeur|\bapk\b|defect|probleem|problemen|kapot|zwakke|betrouwba|storing/],
  ['kleuren', /kleur/],
  ['brandstof', /brandstof|diesel|benzine|elektri|hybride|\blpg\b/],
  ['aantallen', /aantal|hoeveel|registr|per jaar|verkocht|rijden er|op de weg/],
  ['prijs', /prijs|kost|nieuwprijs|catalogus|duur/],
  ['vermogen', /\bpk\b|vermogen|\bkw\b|sterk|motor/],
  ['milieu', /co2|verbruik|zuinig|uitstoot|milieu/],
  ['terugroepacties', /terugroep|recall/],
  ['generaties', /generatie|uitvoering|versies/],
]);

/** Alle onderwerpen met hun label op het scherm. */
export const TOPIC_LABELS = {
  mankementen: 'Mankementen', kleuren: 'Kleuren', brandstof: 'Brandstof', aantallen: 'Aantallen per bouwjaar',
  prijs: 'Nieuwprijs', vermogen: 'Vermogen', milieu: 'CO₂ & verbruik', terugroepacties: 'Terugroepacties',
  generaties: 'Generaties', topmodellen: 'Populairste modellen', topmerken: 'Populairste merken',
};

/**
 * Bouwjaren uit (genormaliseerde) tekst: "2010 2017", "2010 t m 2017", "vanaf 2019", "na 2015", "voor 2010", "2012".
 * @param {string} text @returns {{van: number|null, tot: number|null}}
 */
export function parseYears(text) {
  const Y = '((?:19[5-9]|20[0-4])\\d)';
  let m = text.match(new RegExp(`\\b${Y}\\s+(?:(?:tot en met|t m|tm|tot|en|to|t)\\s+)?${Y}\\b`));
  if (m) return { van: Math.min(+m[1], +m[2]), tot: Math.max(+m[1], +m[2]) };
  m = text.match(new RegExp(`\\b(vanaf|sinds|na|nieuwer dan)\\s+${Y}\\b`));
  if (m) return { van: +m[2] + (m[1] === 'na' || m[1] === 'nieuwer dan' ? 1 : 0), tot: null };
  m = text.match(new RegExp(`\\b(voor|ouder dan|tot en met|tot|t m)\\s+${Y}\\b`));
  if (m) return { van: null, tot: +m[2] - (m[1] === 'voor' || m[1] === 'ouder dan' ? 1 : 0) };
  m = text.match(new RegExp(`\\b${Y}\\b`));
  if (m) return { van: +m[1], tot: +m[1] };
  return { van: null, tot: null };
}

/**
 * Herkent merken/modellen, bouwjaren en onderwerpen in een vraag.
 * Gevonden namen worden uit de tekst gehaald, zodat "Peugeot 2008" niet als jaartal telt.
 * @param {string} question @returns {Promise<Plan>}
 */
export async function parseQuestion(question) {
  let text = normalizeText(question);
  /** @type {Subject[]} */
  const subjects = [];
  const consume = (key) => { text = (' ' + text + ' ').replace(' ' + key + ' ', ' § ').trim(); };

  // Merken + modellen; langste naam eerst ("c3 picasso" vóór "c3")
  for (let guard = 0; guard < 4; guard++) {
    const mk = await findMerkInText(text);
    if (!mk) break;
    consume(mk.key);
    const models = (await modelsOfMerk(mk.merk)).filter((m) => containsWord(text, m.key))
      .sort((a, b) => b.key.length - a.key.length || b.n - a.n);
    if (!models.length) { subjects.push({ merk: mk.merk }); continue; }
    for (const m of models) if (containsWord(text, m.key)) { consume(m.key); subjects.push(m); }
  }
  // Model zonder merk ("golf 2015"): alleen bekende, niet te korte namen
  if (!subjects.length) {
    const seen = new Set();
    let cands = [];
    try { cands = await findModelsByWords(text); } catch { /* zonder model verder */ }
    cands = cands.filter((m) => m.key.length >= 2 && containsWord(text, m.key)).sort((a, b) => b.key.length - a.key.length || b.n - a.n);
    for (const m of cands) {
      if (seen.has(m.key) || !containsWord(text, m.key)) continue;
      seen.add(m.key); consume(m.key); subjects.push(m);
    }
  }
  // Volgorde zoals in de vraag ("yaris en polo" → Yaris eerst)
  const full = ' ' + normalizeText(question) + ' ';
  const pos = (s) => { const i = full.indexOf(' ' + (s.key || normalizeText(s.merk)) + ' '); return i < 0 ? 1e9 : i; };
  subjects.sort((a, b) => pos(a) - pos(b));

  const topics = TOPIC_PATTERNS.filter(([, re]) => re.test(text)).map(([t]) => t);
  if (/merk/.test(text) && !subjects.length) topics.push('topmerken');
  if (/model|populair|meest verkocht|welke/.test(text) && subjects.length && subjects.every((s) => !s.key)) topics.push('topmodellen');
  if (/populair|meest verkocht/.test(text) && !subjects.length && !topics.includes('topmerken')) topics.push('topmerken');
  return { subjects, ...parseYears(text), topics: [...new Set(topics)] };
}

/** Is de vraag volledig genoeg om zonder AI te beantwoorden? @param {Plan} p */
export const isComplete = (p) => (p.subjects.length > 0 && p.topics.length > 0) || p.topics.includes('topmerken');
