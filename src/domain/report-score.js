/**
 * Rapportcijfer (1–10): gewogen gemiddelde van deelcijfers, plus punten en tips in gewone taal.
 * Puur rekenwerk: geen netwerk en geen HTML. Gewichten en drempels staan bovenaan.
 */
import { clamp, daysBetween, fmtDate, fmtNum, num, parseDate, round1, titleCase, yearsSince } from '../lib/format.js';
import { categorizeDefect, defectLookup } from './defects.js';

/** Gewicht per deelcijfer (hoeft niet op 100 uit te komen; er wordt genormaliseerd). */
export const WEIGHTS = Object.freeze({
  apk: 30, kilometerstand: 15, papieren: 20, betrouwbaarheid: 15, leeftijd: 10, milieu: 10,
});

const ENERGY_LABEL_SCORE = { 'A+++': 10, 'A++': 10, 'A+': 9.5, A: 9, B: 8, C: 7, D: 6, E: 5, F: 4, G: 3 };

/** Tip als een categorie bij minstens twee keuringen terugkwam. */
const RECURRING_DEFECT_TIPS = {
  Banden: 'Banden waren vaker afgekeurd. Bekijk het profiel goed of vraag om nieuwe banden.',
  Remmen: 'De remmen hadden vaker mankementen. Laat ze controleren bij een proefrit.',
  'Roest & carrosserie': 'Er werd vaker roest gevonden. Kijk onder de auto en bij de wielkasten.',
  'Sturing & vering': 'Sturing/vering had vaker mankementen. Let op tikken of trekken tijdens de proefrit.',
  Lekkage: 'Er werd vaker lekkage gevonden. Kijk onder de motor naar olievlekken.',
  'Uitlaat & uitstoot': 'De uitlaat/uitstoot was vaker een probleem. Luister naar de uitlaat en let op rook.',
};

/** @typedef {'good'|'warn'|'bad'} PointType */
/** @typedef {{type: PointType, text: string}} Point */
/** @typedef {{naam: string, gewicht: number, score: number, why: string}} Category */
/** @typedef {{label: string, cls: 'ok'|'warn'|'bad'}} Verdict */
/**
 * @typedef {object} PeerStats  Statistieken van vergelijkbare auto's (zie services/model-stats.js)
 * @property {number|null} modelGpk       gemiddeld aantal mankementen per keuring
 * @property {number} metKeuring           auto's met minstens één keuring
 * @property {number} zonderGebreken       auto's die altijd zonder mankementen door de APK kwamen
 */
/**
 * @typedef {object} Report
 * @property {number} total
 * @property {Verdict} verdict
 * @property {Category[]} cats
 * @property {Point[]} points
 * @property {string[]} tips
 * @property {{name: string, n: number, keuringen: number}[]} groups  mankementen per categorie
 * @property {any} st  de gebruikte PeerStats (of null)
 */

/** @param {number} score @returns {Verdict} */
export function verdict(score) {
  if (score >= 8.5) return { label: 'Uitstekend', cls: 'ok' };
  if (score >= 7) return { label: 'Goed', cls: 'ok' };
  if (score >= 5.5) return { label: 'Redelijk', cls: 'warn' };
  if (score >= 4) return { label: 'Matig', cls: 'warn' };
  return { label: 'Slecht', cls: 'bad' };
}

/**
 * Mankementen van één auto per categorie, met het aantal keuringen waarin ze voorkwamen.
 * @param {import('./vehicle-summary.js').VehicleSummary} s
 * @param {import('../api/vehicle.js').VehicleData} data
 */
export function defectGroups(s, data) {
  const lookup = defectLookup(data.gebrekOmschrijving.rows);
  /** @type {Record<string, {name: string, n: number, keer: Set<number>}>} */
  const groups = {};
  for (const e of s.history) {
    for (const g of e.gebreken) {
      const cat = categorizeDefect((lookup[g.gebrek_identificatie] || {}).gebrek_omschrijving);
      groups[cat] = groups[cat] || { name: cat, n: 0, keer: new Set() };
      groups[cat].n += num(g.aantal_gebreken_geconstateerd) || 1;
      groups[cat].keer.add(e.key);
    }
  }
  return Object.values(groups).map((g) => ({ name: g.name, n: g.n, keuringen: g.keer.size })).sort((a, b) => b.n - a.n);
}

/**
 * Berekent het rapport.
 * @param {import('./vehicle-summary.js').VehicleSummary} s
 * @param {import('../api/vehicle.js').VehicleData} data
 * @param {PeerStats|null} st  statistieken van vergelijkbare auto's (mag ontbreken)
 * @returns {Report}
 */
export function scoreVehicle(s, data, st) {
  const v = s.v;
  const now = new Date();
  /** @type {Point[]} */ const points = [];
  /** @type {string[]} */ const tips = [];
  /** @type {Category[]} */ const cats = [];
  const model = titleCase([v.merk, v.handelsbenaming].filter(Boolean).join(' '));
  const ageY = yearsSince(s.toelating);
  const groups = defectGroups(s, data);
  const point = (type, text) => points.push({ type, text });

  // 1. APK-keuringen
  {
    let sc, why;
    const keuringen = s.history.length;
    const last = s.history[0];
    if (!keuringen) {
      if (ageY != null && ageY < 4) { sc = 8.5; why = 'Nog geen APK nodig, de auto is jonger dan 4 jaar.'; }
      else { sc = 6; why = 'Er zijn geen keuringen gevonden in de openbare gegevens.'; }
    } else {
      const gpk = s.gebrekenPerKeuring || 0;
      const ratio = st && st.modelGpk ? gpk / st.modelGpk : null;
      sc = 10 - gpk * 3;
      if (ratio != null && ratio < 0.7) sc += 1;
      if (ratio != null && ratio > 1.5) sc -= 1;
      why = gpk === 0 ? `Bij alle ${keuringen} keuringen geen mankementen gevonden.`
        : `Gemiddeld ${fmtNum(gpk, 1)} mankement${gpk >= 1.05 ? 'en' : ''} per keuring` + (st && st.modelGpk != null ? ` (vergelijkbare auto's: ${fmtNum(st.modelGpk, 1)}).` : '.');
      if (gpk === 0) point('good', `Nooit mankementen gevonden bij de APK (${keuringen} keuringen).`);
      else if (ratio != null && ratio < 0.8) point('good', `Minder mankementen bij de APK dan vergelijkbare ${model}s.`);
      else if (ratio != null && ratio > 1.3) point('warn', `Meer mankementen bij de APK dan vergelijkbare ${model}s.`);
      if (last && last.aantalGebreken === 0) point('good', `Laatste keuring (${fmtDate(last.date)}) zonder mankementen.`);
      if (last && last.aantalGebreken >= 3) { sc -= 1; point('warn', `Bij de laatste keuring werden ${last.aantalGebreken} mankementen gevonden.`); }
    }
    if (s.apk && s.apk < now) { sc = Math.min(sc, 2); point('bad', `De APK is verlopen (sinds ${fmtDate(s.apk)}). Je mag er niet mee de weg op.`); }
    else if (s.apk && daysBetween(now, s.apk) <= 90) { point('warn', `De APK verloopt binnenkort (${fmtDate(s.apk)}).`); tips.push('De APK verloopt binnenkort. Spreek af dat de verkoper de auto eerst laat keuren.'); }
    else if (s.apk) point('good', `APK is geldig tot ${fmtDate(s.apk)}.`);
    cats.push({ naam: 'APK-keuringen', gewicht: WEIGHTS.apk, score: clamp(sc, 1, 10), why });
  }

  // 2. Kilometerstand (NAP-oordeel)
  {
    const o = v.tellerstandoordeel || '';
    let sc = 6, why = 'Er is geen oordeel over de kilometerstand bekend.';
    if (/onlogisch/i.test(o)) {
      sc = 2; why = 'De kilometerstand is onlogisch volgens de Nationale Auto Pas (NAP).';
      point('bad', 'Kilometerstand is onlogisch: er is mogelijk met de teller geknoeid.');
      tips.push('Vraag om het onderhoudsboekje en facturen om de kilometerstand te controleren.');
    } else if (/logisch/i.test(o)) {
      sc = 10; why = 'De kilometerstand loopt logisch op volgens de NAP.';
      point('good', 'Kilometerstand klopt (NAP-logisch).');
    }
    cats.push({ naam: 'Kilometerstand', gewicht: WEIGHTS.kilometerstand, score: sc, why });
  }

  // 3. Papieren & veiligheid
  {
    let sc = 10;
    const issues = [];
    const yes = (field) => /ja/i.test(v[field] || '');
    const no = (field) => /nee/i.test(v[field] || '');
    if (no('wam_verzekerd')) { sc -= 4; issues.push('niet verzekerd'); point('warn', 'De auto is nu niet verzekerd (kan normaal zijn als hij te koop staat of geschorst is).'); }
    if (s.terugroepOpen) {
      sc -= Math.min(5, 3 * s.terugroepOpen); issues.push('open terugroepactie');
      point('bad', `Er ${s.terugroepOpen > 1 ? 'staan ' + s.terugroepOpen + ' terugroepacties' : 'staat een terugroepactie'} open.`);
      tips.push('Er staat een terugroepactie open: de dealer lost dit gratis op. Vraag of het al gedaan is.');
    } else if (yes('openstaande_terugroepactie_indicator')) {
      sc -= 3; issues.push('open terugroepactie');
      point('bad', 'Er staat een terugroepactie open.');
      tips.push('Er staat een terugroepactie open: de dealer lost dit gratis op.');
    } else point('good', 'Geen openstaande terugroepacties.');
    if (yes('export_indicator')) { sc -= 6; issues.push('geëxporteerd'); point('bad', 'De auto staat geregistreerd als geëxporteerd.'); }
    if (no('tenaamstellen_mogelijk')) { sc -= 6; issues.push('overschrijven niet mogelijk'); point('bad', 'De auto kan nu niet op een nieuwe naam gezet worden.'); tips.push('Overschrijven kan nu niet. Koop de auto pas als dit is opgelost.'); }
    if (yes('wacht_op_keuren')) { sc -= 3; issues.push('moet nog gekeurd worden'); point('warn', 'De auto wacht nog op een keuring bij de RDW.'); }
    if (yes('taxi_indicator')) { sc -= 2; issues.push('(ex-)taxi'); point('warn', 'Dit is een (voormalige) taxi: meestal veel kilometers gemaakt.'); }
    cats.push({ naam: 'Papieren & veiligheid', gewicht: WEIGHTS.papieren, score: clamp(sc, 1, 10),
      why: issues.length ? 'Let op: ' + issues.join(', ') + '.' : 'Alles in orde: verzekerd, geen terugroepacties, niet geëxporteerd.' });
  }

  // 4. Betrouwbaarheid van het model (alleen met vergelijkingsdata)
  if (st && st.modelGpk != null) {
    const sc = clamp(10 - st.modelGpk * 5, 2, 10);
    const pct = st.metKeuring ? Math.round(st.zonderGebreken / st.metKeuring * 100) : null;
    cats.push({ naam: 'Betrouwbaarheid model', gewicht: WEIGHTS.betrouwbaarheid, score: sc,
      why: `Vergelijkbare ${model}s hebben gemiddeld ${fmtNum(st.modelGpk, 1)} mankementen per keuring` + (pct != null ? `; ${pct}% kwam altijd zonder mankementen door de APK.` : '.') });
    if (sc >= 8) point('good', `De ${model} is een betrouwbaar model bij de APK.`);
    else if (sc < 5) point('warn', `De ${model} heeft vaker dan gemiddeld mankementen bij de APK.`);
  }

  // 5. Leeftijd & eigenaar
  if (ageY != null) {
    let sc = clamp(10 - ageY * 0.4, 2, 10);
    const own = yearsSince(s.eigenaarSinds);
    let why = `${Math.floor(ageY)} jaar oud.`;
    if (own != null && own >= 3) { sc += 0.5; why += ` Huidige eigenaar heeft hem al ${Math.floor(own)} jaar.`; point('good', `Huidige eigenaar heeft de auto al ${Math.floor(own)} jaar.`); }
    else if (own != null && own < 0.5) { sc -= 1; why += ' Recent van eigenaar gewisseld.'; point('warn', `Pas sinds ${fmtDate(s.eigenaarSinds)} op naam van de huidige eigenaar.`); }
    const nl = parseDate(v.datum_eerste_tenaamstelling_in_nederland_dt || v.datum_eerste_tenaamstelling_in_nederland);
    if (nl && s.toelating && daysBetween(s.toelating, nl) > 365) point('warn', `Geïmporteerd: pas sinds ${fmtDate(nl)} in Nederland. De geschiedenis van daarvoor is onbekend.`);
    cats.push({ naam: 'Leeftijd & eigenaar', gewicht: WEIGHTS.leeftijd, score: clamp(sc, 1, 10), why });
  }

  // 6. Milieu & verbruik
  {
    const label = String(v.zuinigheidsclassificatie || '').toUpperCase();
    const elektrisch = /elektr/i.test(s.brandstof) && !/benzine|diesel/i.test(s.brandstof);
    let sc = null, why = '';
    if (elektrisch) { sc = 10; why = 'Volledig elektrisch: geen uitstoot.'; }
    else if (ENERGY_LABEL_SCORE[label]) { sc = ENERGY_LABEL_SCORE[label]; why = `Energielabel ${label}.`; }
    else if (s.co2) { sc = clamp(10 - (s.co2 - 90) / 20, 2, 10); why = `CO₂-uitstoot ${fmtNum(s.co2)} g/km.`; }
    const euro = parseInt(s.euroklasse, 10);
    if (/diesel/i.test(s.brandstof) && euro && euro <= 3) {
      sc = Math.min(sc ?? 5, 3);
      point('bad', `Oude diesel (Euro ${euro}): niet welkom in milieuzones van diverse steden.`);
    }
    if (sc != null) {
      cats.push({ naam: 'Milieu & verbruik', gewicht: WEIGHTS.milieu, score: sc,
        why: why + (s.verbruik ? ` Verbruik ±${fmtNum(s.verbruik, 1)} l/100 km (1 op ${fmtNum(100 / s.verbruik)}).` : '') });
    }
  }

  for (const g of groups) if (g.keuringen >= 2 && RECURRING_DEFECT_TIPS[g.name]) tips.push(RECURRING_DEFECT_TIPS[g.name]);
  if (!tips.length) tips.push('Maak altijd een proefrit en laat bij twijfel een aankoopkeuring doen.');

  const totalWeight = cats.reduce((a, c) => a + c.gewicht, 0);
  const total = round1(cats.reduce((a, c) => a + c.score * c.gewicht, 0) / totalWeight);
  return { total, verdict: verdict(total), cats: cats.map((c) => ({ ...c, score: round1(c.score) })), points, tips, groups, st };
}
