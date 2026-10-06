/** Kentekens normaliseren en opmaken. */

/** "12-abc-3" → "12ABC3". @param {unknown} input */
export function normalizeKenteken(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Opmaak volgens de Nederlandse sidecodes: groepen letters/cijfers worden gescheiden
 * door streepjes; een groep van 4 tekens wordt in tweeën gesplitst (bijv. "XX-99-99").
 * @param {unknown} input @returns {string} bijv. "12-ABC-3"
 */
export function formatKenteken(input) {
  const k = normalizeKenteken(input);
  const runs = k.match(/[A-Z]+|[0-9]+/g) || [];
  if (runs.length === 3) return runs.join('-');
  if (runs.length === 2) return runs.flatMap((r) => (r.length === 4 ? [r.slice(0, 2), r.slice(2)] : [r])).join('-');
  if (runs.length === 1 && k.length === 6) return `${k.slice(0, 2)}-${k.slice(2, 4)}-${k.slice(4)}`;
  return k;
}
