/** "Vraag het" (#/vraag?q=…): vragen in gewone taal, antwoorden als grafieken. */
import { AI } from '../config.js';
import { subjectLabel } from '../assistant/model-index.js';
import { checkAI, warmUp } from '../assistant/ollama.js';
import { TOPIC_LABELS } from '../assistant/parser.js';
import { summarize } from '../assistant/summary.js';
import { buildJobs } from '../assistant/topics.js';
import { understand } from '../assistant/understand.js';
import { downloadCsv } from '../lib/csv.js';
import { fmtNum } from '../lib/format.js';
import { errorBox, esc, loading } from '../ui/html.js';

/** @typedef {import('../assistant/topics.js').Section} Section */

const EXAMPLES = [
  'Meest voorkomende mankementen van een Citroën C3 bouwjaar 2010-2017',
  'Vergelijk mankementen Toyota Yaris en Volkswagen Polo 2012-2016',
  'Hoeveel Tesla Model 3 per jaar',
  'Kleuren van de Volkswagen Golf vanaf 2020',
  'Terugroepacties Peugeot 208',
  'Populairste modellen van Kia',
  'Generaties van de Opel Corsa',
  'Populairste automerken 2023',
];

const seconds = (ms) => fmtNum(ms / 1000, 1) + ' s';
const exampleButtons = (list) => `<div class="examples">${list.map((x) => `<button type="button" class="chip" data-example>${esc(x)}</button>`).join('')}</div>`;

/** Hoe de vraag begrepen is, als labels. @param {import('../assistant/parser.js').Plan & {via: string}} plan */
function planChips(plan) {
  const chips = plan.subjects.map((s) => `<span class="q-chip">${esc(subjectLabel(s))}</span>`);
  if (plan.van || plan.tot) chips.push(`<span class="q-chip">Bouwjaar ${plan.van || '…'}–${plan.tot || '…'}</span>`);
  for (const t of plan.topics) chips.push(`<span class="q-chip soft">${esc(TOPIC_LABELS[t] || t)}</span>`);
  return `<div class="q-chips"><span class="muted small">Begrepen via ${esc(plan.via)}:</span>${chips.join('')}</div>`;
}

/** @param {Section} sc */
function sectionElement(sc) {
  const d = document.createElement('div');
  d.className = 'answer-sec fade-in';
  d.innerHTML = `<div class="sec-head"><h3>${esc(sc.title)}</h3>${sc.csv ? '<button class="btn ghost btn-sm" data-csv>CSV</button>' : ''}</div>
    ${sc.sub ? `<p class="sub">${esc(sc.sub)}</p>` : ''}${sc.html}`;
  d.querySelector('[data-csv]')?.addEventListener('click', () => downloadCsv(/** @type {any} */ (sc.csv), sc.title));
  return d;
}

/**
 * Beantwoordt één vraag in een nieuwe kaart bovenaan de lijst.
 * @param {HTMLElement} page @param {string} question
 */
async function answer(page, question) {
  const card = document.createElement('section');
  card.className = 'card answer fade-in';
  card.innerHTML = `<div class="q-head"><h2>${esc(question)}</h2><button class="icon-btn" title="Verwijderen" data-remove>✕</button></div>
    <div class="q-body">${loading('Vraag begrijpen…')}</div>`;
  page.querySelector('[data-answers]')?.prepend(card);
  card.querySelector('[data-remove]')?.addEventListener('click', () => card.remove());
  const body = /** @type {HTMLElement} */ (card.querySelector('.q-body'));

  const t0 = performance.now();
  const ai = await checkAI();
  if (ai.ok) warmUp();
  let plan;
  try { plan = await understand(question, ai.ok); } catch (e) { body.innerHTML = errorBox('Kon de RDW-gegevens niet ophalen: ' + e.message); return; }

  if (!plan.subjects.length && !plan.topics.includes('topmerken')) {
    body.innerHTML = '<p>Ik weet niet zeker over welke auto je het hebt. Noem een merk en/of model, bijvoorbeeld:</p>' + exampleButtons(EXAMPLES.slice(0, 3));
    return;
  }

  const tPlan = performance.now();
  const jobs = buildJobs(plan);
  body.innerHTML = `${planChips(plan)}
    ${ai.ok ? `<div class="ai-summary"><span class="ai-label">AI-samenvatting (${esc(AI.model)})</span><div class="ai-text">${loading('Wacht op de RDW-gegevens…')}</div></div>` : ''}
    <div class="answer-grid">${jobs.map((_, i) => `<div class="answer-sec pending" data-job="${i}">${loading('Gegevens ophalen uit het RDW-register…')}</div>`).join('')}</div>
    <p class="timing small muted"></p>`;
  const timing = /** @type {HTMLElement} */ (body.querySelector('.timing'));

  // Elke grafiek tonen zodra die binnen is; volgorde van `sections` = volgorde van binnenkomst
  /** @type {Section[]} */
  const sections = [];
  await Promise.all(jobs.map((job, i) => job.then((result) => {
    const list = (Array.isArray(result) ? result : [result]).filter(Boolean);
    sections.push(...list);
    body.querySelector(`[data-job="${i}"]`)?.replaceWith(...list.map(sectionElement));
  })));
  const tData = performance.now();
  timing.textContent = `Vraag begrijpen: ${seconds(tPlan - t0)} · RDW-gegevens: ${seconds(tData - tPlan)}`;

  if (!ai.ok) return;
  const box = /** @type {HTMLElement} */ (body.querySelector('.ai-text'));
  box.innerHTML = loading('AI denkt na…');
  let firstWord = 0;
  try {
    const text = await summarize(question, sections, (partial) => {
      if (!partial) return;   // nog aan het nadenken
      if (!firstWord) firstWord = performance.now();
      box.textContent = partial;
    });
    if (!text.trim()) box.textContent = 'Geen samenvatting.';
    timing.textContent += ` · AI: ${seconds(performance.now() - tData)}` + (firstWord ? ` (eerste woord na ${seconds(firstWord - tData)})` : '');
  } catch (e) {
    box.textContent = 'Samenvatting mislukt: ' + e.message;
  }
}

/** Status van de lokale AI onder de zoekbalk. @param {HTMLElement} el */
async function showAiStatus(el) {
  const st = await checkAI();
  if (!st.ok) {
    el.innerHTML = `<span class="dot-off"></span>Zonder AI (${esc(st.reason || '')}). Werkt prima; met een lokale AI begrijpt hij vrijere vragen.
      <a href="https://github.com/carelevers/checkapk#lokale-ai" target="_blank" rel="noopener">Zo zet je hem aan</a>.`;
    return;
  }
  el.innerHTML = `<span class="dot-off"></span>Lokale AI <b>${esc(AI.model)}</b> wordt geladen…`;
  const ok = await warmUp();
  el.innerHTML = ok ? `<span class="dot-on"></span>Lokale AI klaar: <b>${esc(AI.model)}</b>` : `<span class="dot-off"></span>Lokale AI <b>${esc(AI.model)}</b> kon niet laden.`;
}

/** @param {HTMLElement} el @param {Record<string, string>} params */
export function renderAskPage(el, params) {
  el.innerHTML = `<section class="ask-hero">
      <span class="eyebrow">Vraag het</span>
      <h1>Stel een vraag over elke auto</h1>
      <p>Typ wat je wilt weten, in gewone taal. De antwoorden en grafieken komen rechtstreeks uit het RDW-register.</p>
      <form class="ask-form" data-ask-form>
        <input name="q" autocomplete="off" placeholder="Bijv. meest voorkomende mankementen van een Citroën C3 2010-2017" value="${esc(params.q || '')}" aria-label="Je vraag">
        <button class="btn btn-lg">Vraag</button>
      </form>
      ${exampleButtons(EXAMPLES)}
      <p class="ai-status small" data-ai-status></p>
    </section>
    <div data-answers></div>`;
  const form = /** @type {HTMLFormElement} */ (el.querySelector('[data-ask-form]'));
  const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('q'));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    history.replaceState(null, '', '#/vraag?q=' + encodeURIComponent(q));
    answer(el, q);
  });
  // Voorbeeldknoppen (ook in latere "begreep het niet"-meldingen)
  el.addEventListener('click', (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('[data-example]');
    if (!b) return;
    input.value = b.textContent || '';
    form.requestSubmit();
  });
  showAiStatus(/** @type {HTMLElement} */ (el.querySelector('[data-ai-status]')));
  if (params.q) answer(el, params.q);
  else input.focus();
}
