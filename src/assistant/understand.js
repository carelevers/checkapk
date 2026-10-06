/** Een vraag begrijpen: eerst met regels, en alleen als dat niet genoeg is met de lokale AI. */
import { normalizeText } from '../lib/format.js';
import { findMerkInText, modelsOfMerk } from './model-index.js';
import { chat } from './ollama.js';
import { TOPIC_LABELS, isComplete, parseQuestion } from './parser.js';

/** @typedef {import('./parser.js').Plan} Plan */

/** JSON-schema dat de AI moet volgen (Ollama "structured outputs"). */
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    autos: { type: 'array', items: { type: 'object', properties: { merk: { type: 'string' }, model: { type: 'string' } }, required: ['merk', 'model'] } },
    bouwjaar_van: { type: 'integer' },
    bouwjaar_tot: { type: 'integer' },
    onderwerpen: { type: 'array', items: { type: 'string', enum: Object.keys(TOPIC_LABELS) } },
  },
  required: ['autos', 'bouwjaar_van', 'bouwjaar_tot', 'onderwerpen'],
};

const PLAN_PROMPT = `Je zet vragen over Nederlandse auto's om naar JSON voor een zoekopdracht in het RDW-kentekenregister.
- autos: lijst van {merk, model}. Merk zoals het RDW het schrijft (bijv. VOLKSWAGEN, CITROEN, MERCEDES-BENZ). Model zonder merk (bijv. GOLF, C3, MODEL 3). Laat model leeg ("") als alleen een merk genoemd wordt. Lege lijst als er geen auto genoemd wordt.
- bouwjaar_van / bouwjaar_tot: jaartallen, 0 als niet genoemd.
- onderwerpen: kies uit ${Object.keys(TOPIC_LABELS).join(', ')}. "mankementen" = APK-gebreken/problemen/betrouwbaarheid.
Antwoord alleen met JSON.`;

/** Laat de AI de vraag omzetten naar een plan (ruwe merk/model-tekst). @param {string} question */
async function askAiForPlan(question) {
  const content = await chat([{ role: 'system', content: PLAN_PROMPT }, { role: 'user', content: question }], { format: PLAN_SCHEMA, timeoutMs: 90000 });
  const json = content.match(/\{[\s\S]*\}/);
  return JSON.parse(json ? json[0] : content);
}

/** Koppelt de merk/model-tekst van de AI aan echte RDW-namen. @returns {Promise<Plan>} */
async function resolveAiPlan(raw) {
  const subjects = [];
  for (const a of raw.autos || []) {
    const mk = (await findMerkInText(normalizeText(a.merk))) || (await findMerkInText(normalizeText(a.merk + ' ' + a.model)));
    if (!mk) continue;
    const key = normalizeText(a.model).replace(new RegExp('^' + normalizeText(mk.merk) + ' '), '');
    if (!key) { subjects.push({ merk: mk.merk }); continue; }
    const models = await modelsOfMerk(mk.merk);
    const hit = models.find((m) => m.key === key)
      || models.filter((m) => m.key.startsWith(key + ' ') || key.startsWith(m.key + ' ')).sort((x, y) => y.n - x.n)[0];
    if (hit) subjects.push(hit);
  }
  const year = (v) => (v && v > 1900 && v < 2100 ? v : null);
  return { subjects, van: year(raw.bouwjaar_van), tot: year(raw.bouwjaar_tot), topics: (raw.onderwerpen || []).filter((t) => TOPIC_LABELS[t]) };
}

/**
 * @param {string} question
 * @param {Promise<boolean>} aiAvailable wordt alleen afgewacht als de AI echt nodig is
 * @returns {Promise<Plan & {via: string}>}
 */
export async function understand(question, aiAvailable) {
  const rule = await parseQuestion(question);
  // Snel pad: als de regels de vraag al volledig begrijpen, niet op de (trage) lokale AI wachten.
  if (isComplete(rule) || !(await aiAvailable)) return { ...rule, via: 'zoekbalk' };
  try {
    const ai = await resolveAiPlan(await askAiForPlan(question));
    return {
      subjects: ai.subjects.length ? ai.subjects : rule.subjects,
      van: ai.van ?? rule.van,
      tot: ai.tot ?? rule.tot,
      topics: ai.topics.length ? ai.topics : rule.topics,
      via: 'AI',
    };
  } catch {
    return { ...rule, via: 'zoekbalk' };
  }
}
