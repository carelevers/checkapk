/** Zoeken op kenteken: groot op de startpagina, compact in de menubalk op alle andere pagina's. */
import { formatKenteken, normalizeKenteken } from '../domain/kenteken.js';
import { getRecent } from '../lib/storage.js';
import { esc } from './html.js';
import { plateHtml, plateInputHtml } from './plate.js';

/** Grote zoekbalk met introductie en recent gezochte kentekens (startpagina). */
export function plateSearchHtml() {
  const recent = getRecent();
  return `<section class="search-hero">
    <span class="eyebrow">Gratis · officiële RDW-gegevens</span>
    <h1>Is het een goede auto?</h1>
    <p>Typ het kenteken en krijg direct een rapportcijfer, alle APK-keuringen en tips voor als je hem wilt kopen.</p>
    <form class="plate-form" data-plate-form>
      ${plateInputHtml({ size: 'lg' })}
      <button class="btn btn-lg">Check</button>
    </form>
    ${recent.length ? `<div class="recent"><span class="muted small">Recent:</span>${recent.map((r) =>
      `<a class="chip chip-plate" href="#/k/${esc(r.kenteken)}">${plateHtml(r.kenteken, 'xs')}<span>${esc(r.titel || '')}</span></a>`).join('')}</div>` : ''}
  </section>`;
}

/**
 * Koppelt het gedrag aan een zoekformulier binnen `root`:
 * opmaken bij verlaten van het veld, naar de kentekenpagina bij verzenden.
 * @param {ParentNode} root @returns {HTMLInputElement|null} het invoerveld
 */
export function bindPlateSearch(root) {
  const form = /** @type {HTMLFormElement|null} */ (root.querySelector('[data-plate-form]'));
  if (!form) return null;
  const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('kenteken'));
  input.addEventListener('blur', () => { if (input.value) input.value = formatKenteken(input.value); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const k = normalizeKenteken(input.value);
    if (k) { location.hash = '#/k/' + k; input.blur(); }
  });
  return input;
}

/** Vult het compacte zoekveld in de menubalk (bijv. met het getoonde kenteken). @param {string} kenteken */
export function setHeaderPlate(kenteken) {
  const input = /** @type {HTMLInputElement|null} */ (document.querySelector('[data-header-search] input'));
  if (input) input.value = kenteken ? formatKenteken(kenteken) : '';
}

/** HTML voor het compacte zoekveld in de menubalk. */
export const headerSearchHtml = () => `<form class="header-search" data-plate-form role="search">
  ${plateInputHtml({ size: 'sm', placeholder: 'Kenteken' })}
  <button class="icon-btn icon-btn--solid" aria-label="Zoeken"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
</form>`;
