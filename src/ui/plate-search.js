/** De gele kenteken-zoekbalk (startpagina en bovenaan de kentekenpagina). */
import { formatKenteken, normalizeKenteken } from '../domain/kenteken.js';
import { getRecent } from '../lib/storage.js';
import { esc } from './html.js';

/** @param {string} [kenteken] ingevuld kenteken; leeg = grote versie voor de startpagina */
export function plateSearchHtml(kenteken = '') {
  const recent = kenteken ? [] : getRecent();
  return `<section class="search-hero${kenteken ? ' compact' : ''}">
    ${kenteken ? '' : `<span class="eyebrow">Gratis · officiële RDW-gegevens</span><h1>Is het een goede auto?</h1>
      <p>Typ het kenteken en krijg direct een rapportcijfer, alle APK-keuringen en tips voor als je hem wilt kopen.</p>`}
    <form class="plate-form" data-plate-form>
      <div class="plate-input"><span class="nl"><span class="stars">★</span>NL</span>
        <input name="kenteken" placeholder="XX-123-X" maxlength="10" autocomplete="off" spellcheck="false"
          value="${esc(kenteken ? formatKenteken(kenteken) : '')}" aria-label="Kenteken"></div>
      <button class="btn btn-lg">Check</button>
    </form>
    ${recent.length ? `<div class="recent"><span class="muted small">Recent:</span>${recent.map((r) =>
      `<a class="chip" href="#/k/${esc(r.kenteken)}"><b>${esc(formatKenteken(r.kenteken))}</b> ${esc(r.titel || '')}</a>`).join('')}</div>` : ''}
  </section>`;
}

/** Koppelt het gedrag (opmaken bij verlaten, naar kentekenpagina bij verzenden). @param {ParentNode} root */
export function bindPlateSearch(root) {
  const form = /** @type {HTMLFormElement|null} */ (root.querySelector('[data-plate-form]'));
  if (!form) return null;
  const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('kenteken'));
  input.addEventListener('blur', () => { if (input.value) input.value = formatKenteken(input.value); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const k = normalizeKenteken(input.value);
    if (k) location.hash = '#/k/' + k;
  });
  return input;
}
