/** APK-gebreken: omschrijvingen koppelen en in gewone-taal-categorieën indelen. */

/** Categorieën op trefwoord in de RDW-omschrijving; de eerste match wint. */
const CATEGORIES = /** @type {[string, RegExp][]} */ ([
  ['Banden', /band|profiel|velg|wiel(?!ophang)/i],
  ['Remmen', /rem/i],
  ['Verlichting', /licht|lamp|reflector|knipper/i],
  ['Ruiten & wissers', /ruit|wisser|sproei|zicht/i],
  ['Sturing & vering', /stuur|fusee|ophanging|schokbreker|veer|kogel|spoorstang|draagarm|stabilisator/i],
  ['Roest & carrosserie', /corrosie|roest|carrosserie|bodem|chassis|spatbord|bumper/i],
  ['Uitlaat & uitstoot', /uitlaat|emissie|roet|katalysator|co[- ]?gehalte|uitstoot|geluid/i],
  ['Lekkage', /lek|olie|vloeistof/i],
  ['Gordels & airbags', /gordel|airbag/i],
  ['Spiegels', /spiegel/i],
  ['Kenteken & papieren', /kenteken|identificatie|chassisnummer|registratie/i],
]);

/** @param {string|undefined} omschrijving @returns {string} categorie, of "Overig" */
export function categorizeDefect(omschrijving) {
  for (const [name, re] of CATEGORIES) if (re.test(omschrijving || '')) return name;
  return 'Overig';
}

/**
 * Maakt een opzoektabel gebrekcode → omschrijving (meest recente versie per code).
 * @param {Record<string, any>[]} rows rijen uit dataset gebrekOmschrijving
 * @returns {Record<string, Record<string, any>>}
 */
export function defectLookup(rows) {
  /** @type {Record<string, Record<string, any>>} */
  const map = {};
  for (const r of rows || []) {
    const prev = map[r.gebrek_identificatie];
    if (!prev || String(r.ingangsdatum_gebrek || '') > String(prev.ingangsdatum_gebrek || '')) map[r.gebrek_identificatie] = r;
  }
  return map;
}

/** Leesbare omschrijving voor een gebrekcode. @param {Record<string, any>} lookup @param {string} id */
export const defectName = (lookup, id) => (lookup[id] && lookup[id].gebrek_omschrijving) || id;
