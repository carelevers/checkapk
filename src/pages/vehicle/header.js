/** Kop van de kentekenpagina: kenteken, merk/model en statuslabels. */
import { daysBetween, fmtDate } from '../../lib/format.js';
import { esc, plateBadge } from '../../ui/html.js';

/** @typedef {import('../../domain/vehicle-summary.js').VehicleSummary} VehicleSummary */

/** @param {string} cls @param {string} text */
const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;

/** @param {VehicleSummary} s */
function apkBadge(s) {
  if (!s.apk) return badge('', 'APK onbekend');
  const d = daysBetween(new Date(), s.apk);
  if (d < 0) return badge('bad', `● APK verlopen sinds ${fmtDate(s.apk)}`);
  if (d <= 60) return badge('warn', `● APK verloopt over ${d} dagen`);
  return badge('ok', `● APK geldig t/m ${fmtDate(s.apk)}`);
}

/** Statuslabels in gewone taal. @param {VehicleSummary} s */
function statusBadges(s) {
  const v = s.v;
  const yes = (f) => /ja/i.test(v[f] || '');
  const out = [apkBadge(s)];
  if (v.wam_verzekerd) out.push(yes('wam_verzekerd') ? badge('ok', 'Verzekerd') : badge('warn', 'Niet verzekerd'));
  if (s.terugroepOpen) out.push(badge('bad', `${s.terugroepOpen} terugroepactie${s.terugroepOpen > 1 ? 's' : ''} open`));
  else if (!s.terugroepTotaal && yes('openstaande_terugroepactie_indicator')) out.push(badge('bad', 'Terugroepactie open'));
  else out.push(badge('ok', 'Geen open terugroepacties'));
  if (/onlogisch/i.test(v.tellerstandoordeel || '')) out.push(badge('bad', 'Kilometerstand onlogisch'));
  else if (/logisch/i.test(v.tellerstandoordeel || '')) out.push(badge('ok', 'Kilometerstand klopt'));
  if (yes('export_indicator')) out.push(badge('bad', 'Geëxporteerd'));
  if (yes('taxi_indicator')) out.push(badge('warn', '(Ex-)taxi'));
  if (yes('wacht_op_keuren')) out.push(badge('warn', 'Wacht op keuren'));
  if (/nee/i.test(v.tenaamstellen_mogelijk || '')) out.push(badge('bad', 'Tenaamstellen niet mogelijk'));
  return out.join('');
}

/** @param {VehicleSummary} s */
export function vehicleHeaderHtml(s) {
  const v = s.v;
  const kleur = v.eerste_kleur && v.eerste_kleur !== 'N.v.t.' ? v.eerste_kleur : null;
  const meta = [v.voertuigsoort, v.inrichting, kleur, s.bouwjaar, s.brandstof].filter(Boolean).map(esc).join(' · ');
  return `<section class="card hero-card">
    <div class="vehicle-head">
      ${plateBadge(s.kenteken, { big: true })}
      <div><h1>${esc(s.titel || 'Onbekend voertuig')}</h1><div class="meta">${meta}</div></div>
      <div class="score-pill-slot" data-score-pill></div>
      <a class="btn ghost" href="#/vergelijk/${esc(s.kenteken)}">+ Vergelijk</a>
    </div>
    <div class="badges">${statusBadges(s)}</div>
  </section>`;
}
