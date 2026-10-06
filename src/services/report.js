/** Rapport voor een voertuig: vergelijkgroep bepalen, statistieken ophalen en cijfer berekenen. */
import { scoreVehicle } from '../domain/report-score.js';
import { computeModelStats, resolvePeerFilter } from './model-stats.js';

/** @type {WeakMap<object, Promise<import('../domain/report-score.js').Report>>} */
const cache = new WeakMap();

/**
 * Geeft het (gecachete) rapport voor een voertuig. Als de vergelijking met andere auto's
 * mislukt, wordt het cijfer zonder die vergelijking berekend.
 * @param {import('../domain/vehicle-summary.js').VehicleSummary} s
 * @param {import('../api/vehicle.js').VehicleData} data
 */
export function getReport(s, data) {
  let p = cache.get(s);
  if (!p) {
    p = resolvePeerFilter(s)
      .then((f) => computeModelStats(f, s))
      .catch(() => null)
      .then((st) => scoreVehicle(s, data, st && !('error' in st) && !('empty' in st) ? /** @type {any} */ (st) : null));
    cache.set(s, p);
  }
  return p;
}
