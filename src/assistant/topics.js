/**
 * Per onderwerp de RDW-gegevens ophalen en een grafiek maken.
 * Nieuw onderwerp toevoegen: zie docs/CONTRIBUTING.md.
 */
import { inList, lit, query, queryByKentekens, yearRange } from '../api/rdw-client.js';
import { categorizeDefect, defectLookup } from '../domain/defects.js';
import { powerBuckets } from '../domain/vehicle-summary.js';
import { countBy, fmtNum, num, parseDate, titleCase } from '../lib/format.js';
import { fetchGenerations } from '../services/model-stats.js';
import { barChart, columnChart } from '../ui/charts.js';
import { errorBox } from '../ui/html.js';
import { subjectLabel } from './model-index.js';

/** @typedef {import('./model-index.js').Subject} Subject */
/** @typedef {import('./parser.js').Plan} Plan */
/**
 * @typedef {object} Section  Eén grafiek in een antwoord
 * @property {string} title
 * @property {string} sub          toelichting onder de titel
 * @property {string} html         de grafiek
 * @property {(string|number)[][]} [csv]  gegevens voor CSV-download en AI-samenvatting (eerste rij = kolomnamen)
 */

/** @returns {Section} */
const section = (title, sub, html, csv) => ({ title, sub, html, csv });
const barCsv = (head, items) => [head, ...items.map((i) => [i.name, i.n])];
const yearsLabel = (p) => (p.van || p.tot ? ` (${p.van || '…'}–${p.tot || '…'})` : '');
const avgPerYear = (by) => Object.keys(by).sort().map((y) => ({ x: y, n: Math.round(by[y].reduce((a, b) => a + b, 0) / by[y].length) }));

/** SoQL-voorwaarde voor een onderwerp + bouwjaren. @param {Subject} s @param {Plan} p */
function whereFor(s, p) {
  const parts = ['merk=' + lit(s.merk)];
  if (s.variants) parts.push('handelsbenaming in' + inList(s.variants));
  return [...parts, ...yearRange(p.van, p.tot)].join(' AND ');
}

/** Steekproef van auto's. @param {Subject} s @param {Plan} p @param {number} size */
const sample = (s, p, size) => query('voertuig', {
  $select: 'kenteken, datum_eerste_toelating, datum_eerste_toelating_dt, catalogusprijs', $where: whereFor(s, p), $limit: size,
});

/** Bouwjaar per kenteken uit een steekproef. */
function yearByKenteken(rows) {
  const out = {};
  for (const r of rows) { const d = parseDate(r.datum_eerste_toelating_dt || r.datum_eerste_toelating); if (d) out[r.kenteken] = d.getFullYear(); }
  return out;
}

/** Mankementen in een steekproef van 600 auto's. @param {Subject} s @param {Plan} p */
export async function defectsFor(s, p) {
  const kentekens = (await sample(s, p, 600)).map((r) => r.kenteken);
  if (!kentekens.length) return null;
  const [gebreken, keuringen] = await Promise.all([
    queryByKentekens('gebreken', kentekens, { $select: 'gebrek_identificatie, count(*) as n', $group: 'gebrek_identificatie' }),
    queryByKentekens('keuringen', kentekens, { $select: 'count(*) as n' }),
  ]);
  /** @type {Record<string, number>} */
  const per = {};
  for (const g of gebreken) per[g.gebrek_identificatie] = (per[g.gebrek_identificatie] || 0) + (num(g.n) || 0);
  const totG = Object.values(per).reduce((a, b) => a + b, 0);
  const totK = keuringen.reduce((a, r) => a + (num(r.n) || 0), 0);
  const ids = Object.keys(per);
  const lookup = ids.length ? defectLookup(await query('gebrekOmschrijving', { $where: 'gebrek_identificatie in' + inList(ids.slice(0, 900)), $limit: 5000 })) : {};
  const name = (id) => (lookup[id] || {}).gebrek_omschrijving;
  /** @type {Record<string, number>} */
  const cats = {};
  for (const [id, n] of Object.entries(per)) { const c = categorizeDefect(name(id)); cats[c] = (cats[c] || 0) + n; }
  return {
    n: kentekens.length, gpk: totK ? totG / totK : null,
    top: Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, n]) => ({ name: name(id) || id, n })),
    cats: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
  };
}

/** Leesbare tekst van een terugroepactie (veldnamen verschillen per actie). @param {Record<string, any>} r */
function recallText(r) {
  const keys = Object.keys(r).filter((k) => /omschrijving|defect|gevolg|titel|probleem/i.test(k));
  return keys.map((k) => r[k]).find((v) => v && String(v).length > 8) || r.referentiecode_rdw;
}

/**
 * Handlers per onderwerp. Elk krijgt (subject, plan) en geeft één of meer secties.
 * @type {Record<string, (s: Subject, p: Plan) => Promise<Section|Section[]>>}
 */
const TOPIC_HANDLERS = {
  async mankementen(s, p) {
    const L = subjectLabel(s) + yearsLabel(p);
    const d = await defectsFor(s, p);
    if (!d) return section(`Mankementen ${L}`, '', '<p class="muted">Geen auto\'s gevonden.</p>');
    return [
      section(`Meest gevonden mankementen bij ${L}`, `APK-keuringen van een steekproef van ${fmtNum(d.n)} auto's · gemiddeld ${d.gpk != null ? fmtNum(d.gpk, 2) : '?'} mankementen per keuring`,
        barChart(d.top), barCsv(['mankement', 'aantal'], d.top)),
      section(`Per onderdeel: ${L}`, 'Mankementen gegroepeerd', barChart(d.cats, { pct: true }), barCsv(['onderdeel', 'aantal'], d.cats)),
    ];
  },

  async aantallen(s, p) {
    const rows = await query('voertuig', { $select: 'date_extract_y(datum_eerste_toelating_dt) as jaar, count(*) as n', $where: whereFor(s, p), $group: 'jaar', $order: 'jaar', $limit: 200 });
    const items = rows.filter((r) => r.jaar).map((r) => ({ x: r.jaar, n: num(r.n) || 0 }));
    const total = items.reduce((a, i) => a + i.n, 0);
    return section(`${subjectLabel(s)} op kenteken per bouwjaar${yearsLabel(p)}`, `${fmtNum(total)} auto's in totaal`, columnChart(items),
      [['bouwjaar', 'aantal'], ...items.map((i) => [i.x, i.n])]);
  },

  async kleuren(s, p) {
    const rows = await query('voertuig', { $select: 'eerste_kleur, count(*) as n', $where: whereFor(s, p), $group: 'eerste_kleur', $order: 'n DESC', $limit: 15 });
    const items = rows.filter((r) => r.eerste_kleur && r.eerste_kleur !== 'N.v.t.').map((r) => ({ name: titleCase(r.eerste_kleur), n: num(r.n) || 0 }));
    return section(`Kleuren ${subjectLabel(s)}${yearsLabel(p)}`, '', barChart(items, { pct: true }), barCsv(['kleur', 'aantal'], items));
  },

  async prijs(s, p) {
    const rows = await sample(s, p, 3000);
    const years = yearByKenteken(rows);
    const by = {};
    for (const r of rows) { const pr = num(r.catalogusprijs); const y = years[r.kenteken]; if (y && pr > 0) (by[y] = by[y] || []).push(pr); }
    const items = avgPerYear(by);
    return section(`Gemiddelde nieuwprijs ${subjectLabel(s)} per bouwjaar${yearsLabel(p)}`, `Catalogusprijs, steekproef van ${fmtNum(rows.length)} auto's`,
      columnChart(items), [['bouwjaar', 'gem. catalogusprijs'], ...items.map((i) => [i.x, i.n])]);
  },

  async vermogen(s, p) {
    const rows = await sample(s, p, 1000);
    const items = powerBuckets(await queryByKentekens('brandstof', rows.map((r) => r.kenteken)));
    return section(`Motorvermogen ${subjectLabel(s)}${yearsLabel(p)}`, `Steekproef van ${fmtNum(rows.length)} auto's`, barChart(items, { pct: true }), barCsv(['vermogen', 'aantal'], items));
  },

  async brandstof(s, p) {
    const rows = await sample(s, p, 1000);
    const items = countBy((await queryByKentekens('brandstof', rows.map((r) => r.kenteken))).map((r) => r.brandstof_omschrijving));
    return section(`Brandstof ${subjectLabel(s)}${yearsLabel(p)}`, `Steekproef van ${fmtNum(rows.length)} auto's`, barChart(items, { pct: true }), barCsv(['brandstof', 'aantal'], items));
  },

  async milieu(s, p) {
    const rows = await sample(s, p, 1000);
    const years = yearByKenteken(rows);
    const by = {};
    for (const r of await queryByKentekens('brandstof', rows.map((x) => x.kenteken))) {
      const c = num(r.co2_uitstoot_gecombineerd); const y = years[r.kenteken];
      if (c > 0 && y) (by[y] = by[y] || []).push(c);
    }
    const items = avgPerYear(by);
    return section(`Gemiddelde CO₂-uitstoot ${subjectLabel(s)} per bouwjaar${yearsLabel(p)}`, 'Gram per kilometer (lager = zuiniger)',
      columnChart(items), [['bouwjaar', 'gem. co2 g/km'], ...items.map((i) => [i.x, i.n])]);
  },

  async terugroepacties(s, p) {
    const rows = await sample(s, p, 1000);
    const statuses = await queryByKentekens('terugroepStatus', rows.map((r) => r.kenteken));
    const refs = countBy(statuses.map((r) => r.referentiecode_rdw)).slice(0, 10);
    let details = {};
    if (refs.length) {
      try {
        details = Object.fromEntries((await query('terugroepActie', { $where: 'referentiecode_rdw in' + inList(refs.map((r) => r.name)), $limit: 100 })).map((r) => [r.referentiecode_rdw, r]));
      } catch { /* dan alleen de codes tonen */ }
    }
    const items = refs.map((r) => ({ name: details[r.name] ? recallText(details[r.name]) : r.name, ref: r.name, n: r.n / rows.length * 100 }));
    return section(`Terugroepacties ${subjectLabel(s)}${yearsLabel(p)}`, `% van ${fmtNum(rows.length)} auto's dat erdoor geraakt werd`,
      items.length ? barChart(items, { fmt: (x) => fmtNum(x, 1) + '%' }) : '<p class="muted">Geen terugroepacties gevonden in de steekproef.</p>',
      [['terugroepactie', 'referentie', '% auto\'s'], ...items.map((i) => [i.name, i.ref, i.n.toFixed(1)])]);
  },

  async generaties(s) {
    const g = await fetchGenerations({ merk: s.merk, model: s.variants ? s.variants[0] : '' });
    const items = g.list.map((x) => ({ name: `${x.van || '?'}–${x.tot || '?'}${x.types.length ? ' (type ' + x.types.join(', ') + ')' : ''}`, n: x.n }));
    return section(`Generaties ${subjectLabel(s)}`, 'Jaren waarin 90% van elke generatie op kenteken kwam', barChart(items), barCsv(['generatie', 'aantal'], items));
  },

  async topmodellen(s, p) {
    const rows = await query('voertuig', { $select: 'handelsbenaming, count(*) as n', $where: whereFor({ merk: s.merk }, p), $group: 'handelsbenaming', $order: 'n DESC', $limit: 15 });
    const items = rows.filter((r) => r.handelsbenaming).map((r) => ({ name: r.handelsbenaming, n: num(r.n) || 0 }));
    return section(`Populairste modellen van ${titleCase(s.merk)}${yearsLabel(p)}`, 'Aantal op kenteken', barChart(items), barCsv(['model', 'aantal'], items));
  },
};

/** Onderwerpen zonder merk/model. */
const GLOBAL_HANDLERS = {
  async topmerken(p) {
    const where = ["voertuigsoort='Personenauto'", ...yearRange(p.van, p.tot)].join(' AND ');
    const rows = await query('voertuig', { $select: 'merk, count(*) as n', $where: where, $group: 'merk', $order: 'n DESC', $limit: 15 });
    const items = rows.map((r) => ({ name: titleCase(r.merk), n: num(r.n) || 0 }));
    return section(`Populairste automerken${yearsLabel(p)}`, 'Personenauto\'s op kenteken', barChart(items), barCsv(['merk', 'aantal'], items));
  },
};

/** Standaardonderwerpen als de vraag er geen noemt. @param {Plan} plan */
function defaultTopics(plan) {
  if (!plan.subjects.length) return [];
  return plan.subjects.every((s) => !s.key) ? ['topmodellen', 'aantallen'] : ['aantallen', 'mankementen'];
}

/**
 * Maakt de opdrachten voor een plan. Elke opdracht is een promise die één of meer secties geeft;
 * zo kan de pagina elke grafiek tonen zodra die klaar is.
 * @param {Plan} plan @returns {Promise<Section|Section[]>[]}
 */
export function buildJobs(plan) {
  const topics = plan.topics.length ? plan.topics : defaultTopics(plan);
  const jobs = [];
  for (const t of topics) {
    if (GLOBAL_HANDLERS[t]) jobs.push(GLOBAL_HANDLERS[t](plan));
    else if (TOPIC_HANDLERS[t]) for (const s of plan.subjects) jobs.push(TOPIC_HANDLERS[t](s, plan));
  }
  if (plan.subjects.length > 1 && topics.includes('mankementen')) {
    jobs.push(Promise.all(plan.subjects.map((s) => defectsFor(s, plan))).then((ds) => {
      const items = plan.subjects.map((s, i) => ({ name: subjectLabel(s), n: ds[i]?.gpk ?? 0 }));
      return section('Vergelijking: mankementen per APK-keuring', 'Lager is beter', barChart(items, { fmt: (x) => fmtNum(x, 2) }),
        [['model', 'mankementen per keuring'], ...items.map((i) => [i.name, i.n.toFixed(3)])]);
    }));
  }
  return jobs.map((j) => j.catch((e) => section('Mislukt', '', errorBox(e.message))));
}
