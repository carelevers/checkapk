/** Generaties herkennen via de Europese typegoedkeuring. */

/**
 * "e2*2001/116*0293*15" → "e2*2001/116*0293". Het laatste deel is een uitbreiding
 * (facelift, nieuwe motor); een nieuwe generatie krijgt een nieuw basisnummer. Eén
 * generatie kan wel meerdere basisnummers hebben (bijv. per carrosserie).
 * @param {unknown} v @returns {string}
 */
export function typeApprovalBase(v) {
  if (!v) return '';
  const parts = String(v).trim().split('*');
  return parts.length >= 4 ? parts.slice(0, 3).join('*') : String(v).trim();
}

/**
 * @typedef {object} PeerFilter  Filter voor een groep vergelijkbare auto's
 * @property {string} merk
 * @property {string} model
 * @property {string} [tgk]        basis-typegoedkeuring (generatie)
 * @property {string} [type]       RDW-type, als er geen typegoedkeuring is
 * @property {number|string} [van] bouwjaar vanaf
 * @property {number|string} [tot] bouwjaar tot en met
 * @property {string} [groep]      leesbare omschrijving van de gekozen groep
 */

/** Leesbare omschrijving van een filter. @param {PeerFilter} f */
export function describePeerFilter(f) {
  const gen = f.tgk ? 'generatie ' + f.tgk : f.type ? 'type ' + f.type : '';
  const jr = f.van || f.tot ? `bouwjaar ${f.van || '…'}–${f.tot || '…'}` : 'alle bouwjaren';
  return [gen, jr].filter(Boolean).join(', ');
}

/**
 * Kandidaat-vergelijkgroepen voor een auto, van zo precies mogelijk naar ruim:
 * 1) zelfde generatie + bouwjaar ±2, 2) zelfde generatie, 3) bouwjaar ±1, 4) hele model.
 * @param {Record<string, any>} v rij uit "Gekentekende voertuigen"
 * @param {number|null} bouwjaar
 * @returns {PeerFilter[]}
 */
export function peerFilterCandidates(v, bouwjaar) {
  const base = { merk: v.merk || '', model: v.handelsbenaming || '' };
  const b = bouwjaar;
  const tgk = typeApprovalBase(v.typegoedkeuringsnummer);
  const gen = tgk ? { tgk } : v.type ? { type: v.type } : null;
  const genTxt = tgk ? `zelfde generatie (typegoedkeuring ${tgk})` : `zelfde type (${v.type})`;
  const out = [];
  if (gen && b) out.push({ ...base, ...gen, van: b - 2, tot: b + 2, groep: `${genTxt}, bouwjaar ${b - 2}–${b + 2}` });
  if (gen) out.push({ ...base, ...gen, van: '', tot: '', groep: `${genTxt}, alle bouwjaren` });
  if (b) out.push({ ...base, van: b - 1, tot: b + 1, groep: `bouwjaar ${b - 1}–${b + 1} (generatie onbekend)` });
  out.push({ ...base, van: '', tot: '', groep: 'alle bouwjaren' });
  return out;
}

/**
 * Jaren waarin het grootste deel (standaard 90%) van een groep op kenteken kwam;
 * later geïmporteerde exemplaren tellen dan niet mee.
 * @param {Record<string, number>} years jaar → aantal
 * @param {number} [coverage=0.9]
 */
export function coreYears(years, coverage = 0.9) {
  const ys = Object.keys(years).map(Number).sort((a, b) => a - b);
  const sum = ys.reduce((a, y) => a + years[y], 0);
  const lo = (1 - coverage) / 2, hi = 1 - lo;
  let acc = 0, van = null, tot = null;
  for (const y of ys) {
    acc += years[y];
    if (van == null && acc >= sum * lo) van = y;
    if (tot == null && acc >= sum * hi) tot = y;
  }
  return { van, tot, min: ys[0], max: ys[ys.length - 1] };
}
