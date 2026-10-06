/**
 * Statistieken over groepen vergelijkbare auto's (zelfde model/generatie/bouwjaren).
 * Gebruikt door het rapportcijfer, "Vergelijk met zelfde type" en "Model bekijken".
 */
import { DEFECT_SAMPLE_SIZE, MIN_PEER_GROUP } from '../config.js';
import { inList, lit, query, querySafe, yearRange } from '../api/rdw-client.js';
import { defectLookup } from '../domain/defects.js';
import { coreYears, describePeerFilter, peerFilterCandidates, typeApprovalBase } from '../domain/generation.js';
import { average, countBy, num, parseDate } from '../lib/format.js';

/** @typedef {import('../domain/generation.js').PeerFilter} PeerFilter */
/** @typedef {import('../domain/vehicle-summary.js').VehicleSummary} VehicleSummary */

/**
 * SoQL-voorwaarde voor een filter.
 * @param {PeerFilter} f @param {boolean} [narrow=true] false = alleen merk/model (zonder generatie en jaren)
 */
export function modelWhere(f, narrow = true) {
  const parts = [];
  if (f.merk) parts.push('merk=' + lit(f.merk.toUpperCase()));
  if (f.model) parts.push('handelsbenaming=' + lit(f.model.toUpperCase()));
  if (narrow) {
    if (f.tgk) parts.push('typegoedkeuringsnummer like ' + lit(f.tgk + '*%'));
    else if (f.type) parts.push('type=' + lit(f.type));
    parts.push(...yearRange(f.van, f.tot));
  }
  return parts.join(' AND ');
}

/** @type {WeakMap<VehicleSummary, Promise<PeerFilter>>} */
const peerCache = new WeakMap();

/**
 * Kiest de nauwste vergelijkgroep met genoeg auto's (zie peerFilterCandidates).
 * @param {VehicleSummary} s @returns {Promise<PeerFilter>}
 */
export function resolvePeerFilter(s) {
  const cached = peerCache.get(s);
  if (cached) return cached;
  const p = (async () => {
    const cands = peerFilterCandidates(s.v, s.bouwjaar);
    let fallback = cands[cands.length - 1];
    for (const f of cands) {
      try {
        const r = await query('voertuig', { $select: 'count(*) as n', $where: modelWhere(f) });
        const n = num(r[0] && r[0].n) || 0;
        if (n > MIN_PEER_GROUP) return f;   // ">" want de auto zelf telt mee
        if (n > 1 && fallback === cands[cands.length - 1]) fallback = f;
      } catch { /* volgende kandidaat proberen */ }
    }
    return fallback;
  })();
  peerCache.set(s, p);
  return p;
}

/**
 * Generaties/uitvoeringen van een model met de jaren waarin ze vooral geregistreerd zijn.
 * @param {{merk: string, model: string}} f
 */
export async function fetchGenerations(f) {
  const where = modelWhere({ merk: f.merk, model: f.model }, false);
  const params = (cols) => ({ $select: cols + ', date_extract_y(datum_eerste_toelating_dt) as jaar, count(*) as n', $where: where, $group: cols + ', jaar', $limit: 50000 });
  let rows;
  try { rows = await query('voertuig', params('typegoedkeuringsnummer, type')); }
  catch { rows = await query('voertuig', params('typegoedkeuringsnummer')); }

  /** @type {Record<string, {key: string, tgk: string, type: string, types: Set<string>, years: Record<string, number>, n: number}>} */
  const groups = {};
  let total = 0;
  for (const r of rows) {
    const n = num(r.n) || 0;
    const tgk = typeApprovalBase(r.typegoedkeuringsnummer);
    const key = tgk || (r.type ? 'type:' + r.type : 'onbekend');
    const g = groups[key] = groups[key] || { key, tgk, type: r.type || '', types: new Set(), years: {}, n: 0 };
    if (r.type) g.types.add(r.type);
    if (r.jaar) g.years[r.jaar] = (g.years[r.jaar] || 0) + n;
    g.n += n; total += n;
  }
  const list = Object.values(groups)
    .map((g) => ({ ...g, types: [...g.types], ...coreYears(g.years), share: total ? g.n / total : 0 }))
    .filter((g) => g.share >= 0.005 || g.n >= 50)
    .sort((a, b) => (a.van || 9999) - (b.van || 9999) || b.n - a.n);
  return { list, total };
}

/** Sleutel van de generatie van een auto, zoals in fetchGenerations. @param {Record<string, any>} v */
export const generationKey = (v) => typeApprovalBase(v.typegoedkeuringsnummer) || (v.type ? 'type:' + v.type : '');

/** Sleutel van de generatie in een filter. @param {PeerFilter} f */
export const filterGenerationKey = (f) => f.tgk || (f.type ? 'type:' + f.type : '');

/**
 * Berekent alle statistieken voor een groep. Kentekens voor APK-statistieken worden
 * verspreid uit de resultaten gekozen (steekproef van DEFECT_SAMPLE_SIZE).
 * @param {PeerFilter} f
 * @param {VehicleSummary|null} [self] de eigen auto: telt niet mee in gemiddelden en wordt gemarkeerd
 */
export async function computeModelStats(f, self = null) {
  const whereAll = modelWhere(f, false);
  const where = modelWhere(f);
  const [cntAll, cnt, perJaar, perKleur, sample] = await Promise.all([
    querySafe('voertuig', { $select: 'count(*) as n', $where: whereAll }),
    querySafe('voertuig', { $select: 'count(*) as n', $where: where }),
    querySafe('voertuig', { $select: 'date_extract_y(datum_eerste_toelating_dt) as jaar, count(*) as n', $where: whereAll, $group: 'jaar', $order: 'jaar', $limit: 200 }),
    querySafe('voertuig', { $select: 'eerste_kleur, count(*) as n', $where: where, $group: 'eerste_kleur', $order: 'n DESC', $limit: 12 }),
    querySafe('voertuig', { $where: where, $limit: 1000 }),
  ]);
  if (sample.error) return { error: 'Ophalen mislukt: ' + sample.error };
  if (!sample.length) return { empty: true };

  const total = cnt.error ? sample.length : num(cnt[0] && cnt[0].n) || 0;
  const totalAll = cntAll.error ? null : num(cntAll[0] && cntAll[0].n);
  const now = new Date();
  const pct = (pred) => sample.filter(pred).length / sample.length * 100;
  const usable = (v) => v && v !== 'Niet geregistreerd' && v !== 'N.v.t.';

  // APK-steekproef
  const step = Math.max(1, Math.floor(sample.length / DEFECT_SAMPLE_SIZE));
  const kentekens = sample.filter((_, i) => i % step === 0).slice(0, DEFECT_SAMPLE_SIZE).map((r) => r.kenteken);
  if (self && !kentekens.includes(self.kenteken)) kentekens.push(self.kenteken);
  const inK = 'kenteken in' + inList(kentekens);
  const [gebrekTop, gebrekPerAuto, keuringPerAuto, fuel] = await Promise.all([
    querySafe('gebreken', { $select: 'gebrek_identificatie, count(*) as n', $where: inK, $group: 'gebrek_identificatie', $order: 'n DESC', $limit: 15 }),
    querySafe('gebreken', { $select: 'kenteken, count(*) as n', $where: inK, $group: 'kenteken', $limit: 5000 }),
    querySafe('keuringen', { $select: 'kenteken, count(*) as n', $where: inK, $group: 'kenteken', $limit: 5000 }),
    querySafe('brandstof', { $where: inK, $limit: 5000 }),
  ]);
  let lookup = {};
  if (!gebrekTop.error && gebrekTop.length) {
    const o = await querySafe('gebrekOmschrijving', { $where: 'gebrek_identificatie in' + inList(gebrekTop.map((g) => g.gebrek_identificatie)), $limit: 1000 });
    if (!o.error) lookup = defectLookup(o);
  }

  const others = kentekens.filter((k) => !self || k !== self.kenteken);
  const perCar = (rows) => Object.fromEntries((rows.error ? [] : rows).map((r) => [r.kenteken, num(r.n) || 0]));
  const gPer = perCar(gebrekPerAuto), kPer = perCar(keuringPerAuto);
  const totG = others.reduce((s, k) => s + (gPer[k] || 0), 0);
  const totK = others.reduce((s, k) => s + (kPer[k] || 0), 0);
  const fuelRows = fuel.error ? [] : fuel.filter((r) => !self || r.kenteken !== self.kenteken);

  return {
    f, self,
    groep: f.groep || describePeerFilter(f),
    label: [f.merk, f.model].filter(Boolean).join(' ').toUpperCase()
      + (f.van || f.tot ? ` (${f.van || '…'}–${f.tot || '…'})` : '') + (f.tgk || f.type ? ', zelfde generatie' : ''),
    sample, total, totalAll,
    prijs: average(sample.map((r) => num(r.catalogusprijs)).filter((n) => n > 0)),
    massa: average(sample.map((r) => num(r.massa_rijklaar))),
    apkVerlopen: pct((r) => { const d = parseDate(r.vervaldatum_apk_dt || r.vervaldatum_apk); return d && d < now; }),
    exportPct: pct((r) => /ja/i.test(r.export_indicator || '')),
    terugroepPct: pct((r) => /ja/i.test(r.openstaande_terugroepactie_indicator || '')),
    onlogischPct: pct((r) => /onlogisch/i.test(r.tellerstandoordeel || '')),
    inrichtingItems: countBy(sample.map((r) => r.inrichting).filter(usable)).slice(0, 10),
    gebrekTop, lookup, others, gPer, kPer, totG, totK,
    modelGpk: totK ? totG / totK : null,
    zonderGebreken: others.filter((k) => kPer[k] && !gPer[k]).length,
    metKeuring: others.filter((k) => kPer[k]).length,
    fuelRows,
    fuelItems: countBy(fuelRows.map((r) => r.brandstof_omschrijving)).map((i) => ({ ...i, hl: !!self && self.brandstof.includes(i.name) })),
    co2: average(fuelRows.map((r) => num(r.co2_uitstoot_gecombineerd)).filter((n) => n > 0)),
    kw: average(fuelRows.map((r) => num(r.nettomaximumvermogen)).filter((n) => n > 0)),
    verbruik: average(fuelRows.map((r) => num(r.brandstofverbruik_gecombineerd)).filter((n) => n > 0)),
    jaarItems: perJaar.error ? [] : perJaar.filter((r) => r.jaar).map((r) => ({ x: r.jaar, n: num(r.n) || 0, hl: !!self && +r.jaar === self.bouwjaar })),
    kleurItems: perKleur.error
      ? countBy(sample.map((r) => r.eerste_kleur).filter(usable)).slice(0, 10)
      : perKleur.filter((r) => r.eerste_kleur).map((r) => ({ name: r.eerste_kleur, n: num(r.n) || 0, hl: !!self && r.eerste_kleur === self.v.eerste_kleur })),
  };
}

/** @typedef {Exclude<Awaited<ReturnType<typeof computeModelStats>>, {error: string}|{empty: true}>} ModelStats */
