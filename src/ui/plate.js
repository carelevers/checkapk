/**
 * Nederlandse kentekenplaat: blauwe EU-strook met 12 sterren en "NL", gele plaat, zwarte letters.
 * Eén onderdeel voor alle formaten; de maat volgt uit de CSS-variabele --plate-h (zie components.css).
 */
import { formatKenteken } from '../domain/kenteken.js';
import { esc } from './html.js';

/** @typedef {'xs'|'sm'|'md'|'lg'} PlateSize */

/** Pad van één vijfpuntige ster rond (cx, cy). */
function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

/** 12 sterren in een cirkel, zoals op de Europese vlag. */
const STARS_PATH = Array.from({ length: 12 }, (_, i) => {
  const a = i * Math.PI / 6;
  return star(10 + 7 * Math.sin(a), 10 - 7 * Math.cos(a), 1.45);
}).join('');

const EU_BAND = `<span class="plate-eu" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="${STARS_PATH}"/></svg><b>NL</b></span>`;

/**
 * Kenteken als plaatje.
 * @param {string} kenteken @param {PlateSize} [size='sm'] @param {string} [text] andere tekst (bijv. merknaam)
 */
export function plateHtml(kenteken, size = 'sm', text) {
  return `<span class="plate plate--${size}">${EU_BAND}<span class="plate-text">${esc(text ?? formatKenteken(kenteken))}</span></span>`;
}

/**
 * Kenteken-invoerveld in de vorm van een plaat.
 * @param {{name?: string, value?: string, size?: PlateSize, placeholder?: string, label?: string}} [opts]
 */
export function plateInputHtml(opts = {}) {
  const { name = 'kenteken', value = '', size = 'lg', placeholder = 'XX-123-X', label = 'Kenteken' } = opts;
  return `<label class="plate plate--${size} plate--input">${EU_BAND}<input class="plate-text" name="${esc(name)}"
    value="${esc(value ? formatKenteken(value) : '')}" placeholder="${esc(placeholder)}" maxlength="10"
    autocomplete="off" spellcheck="false" aria-label="${esc(label)}"></label>`;
}
