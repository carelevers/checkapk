/** Tijdlijn van APK-keuringen met de gevonden mankementen. */
import { categorizeDefect, defectLookup } from '../../domain/defects.js';
import { fmtDate, num } from '../../lib/format.js';
import { esc } from '../../ui/html.js';

/**
 * @param {import('../../domain/vehicle-summary.js').ApkEvent[]} events
 * @param {import('../../api/vehicle.js').VehicleData} data
 */
export function apkTimelineHtml(events, data) {
  if (!events.length) return '<p class="muted">Geen APK-keuringen gevonden.</p>';
  const lookup = defectLookup(data.gebrekOmschrijving.rows);
  return '<ul class="timeline">' + events.map((e) => {
    const k = e.keuringen[0] || {};
    const soortRaw = k.soort_melding_ki_omschrijving || k.soort_erkenning_omschrijving || '';
    const soort = /periodiek|apk/i.test(soortRaw) || !soortRaw ? 'APK-keuring' : soortRaw.charAt(0).toUpperCase() + soortRaw.slice(1);
    const verval = k.vervaldatum_keuring_dt || k.vervaldatum_keuring;
    const cls = e.aantalGebreken === 0 ? '' : e.aantalGebreken >= 4 ? 'bad' : 'warn';
    const defects = e.gebreken.map((g) => {
      const name = (lookup[g.gebrek_identificatie] || {}).gebrek_omschrijving;
      const n = num(g.aantal_gebreken_geconstateerd) || 1;
      return `<li><span class="cat-chip">${esc(categorizeDefect(name))}</span><span>${n > 1 ? `<b>${n}×</b> ` : ''}${esc(name || 'Mankement')}</span></li>`;
    }).join('');
    const found = e.aantalGebreken ? `<b>${e.aantalGebreken} mankement${e.aantalGebreken > 1 ? 'en' : ''} gevonden</b>` : 'zonder mankementen';
    return `<li><span class="dot ${cls}"></span>
      <div class="when">${fmtDate(e.date)}</div>
      <div class="what">${esc(soort)} · ${found}${verval ? ' · goedgekeurd t/m ' + fmtDate(verval) : ''}</div>
      ${defects ? `<ul class="defects">${defects}</ul>` : ''}</li>`;
  }).join('') + '</ul>';
}
