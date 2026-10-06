/** Eenvoudige grafieken in pure HTML/CSS (geen bibliotheek nodig). */
import { fmtNum } from '../lib/format.js';
import { esc } from './html.js';

/** @typedef {{name: string, n: number, hl?: boolean}} BarItem */
/** @typedef {{x: string|number, n: number, hl?: boolean}} ColumnItem */

/**
 * Horizontale balken.
 * @param {BarItem[]} items
 * @param {{pct?: boolean, total?: number, fmt?: (n: number) => string}} [opts]
 *   pct: toon percentage van `total` (standaard: som van de items); fmt: eigen opmaak van de waarde
 */
export function barChart(items, opts = {}) {
  if (!items.length) return '<p class="muted">Geen gegevens.</p>';
  const max = Math.max(...items.map((i) => i.n)) || 1;
  const total = opts.total || items.reduce((s, i) => s + i.n, 0);
  const label = (i) => (opts.fmt ? opts.fmt(i.n) : opts.pct ? (i.n / total * 100).toFixed(1) + '%' : fmtNum(i.n));
  return '<div class="bars">' + items.map((i) => `
    <div class="bar-row" title="${esc(i.name)}: ${esc(fmtNum(i.n, 2))}">
      <div class="name">${esc(i.name)}</div>
      <div class="bar-track"><div class="bar-fill${i.hl ? ' hl' : ''}" style="width:${(i.n / max * 100).toFixed(1)}%"></div></div>
      <div class="n">${esc(label(i))}</div>
    </div>`).join('') + '</div>';
}

/** Kolomgrafiek (bijv. per jaar). @param {ColumnItem[]} items */
export function columnChart(items) {
  if (!items.length) return '<p class="muted">Geen gegevens.</p>';
  const max = Math.max(...items.map((i) => i.n)) || 1;
  return '<div class="colchart">' + items.map((i) => `
    <div class="col${i.hl ? ' hl' : ''}" title="${esc(i.x)}: ${esc(fmtNum(i.n))}">
      <div class="bw"><div class="b" style="height:${(i.n / max * 100).toFixed(1)}%"></div></div>
      <div class="x">${esc(i.x)}</div>
    </div>`).join('') + '</div>';
}

/**
 * Cirkel met het rapportcijfer.
 * @param {number} score 0–10 @param {'ok'|'warn'|'bad'} cls @param {string} text bijv. "7,7" @param {number} [size=168]
 */
export function scoreRing(score, cls, text, size = 168) {
  const R = 52, C = 2 * Math.PI * R;
  return `<svg class="ring ${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Rapportcijfer ${esc(text)} van 10">
    <circle cx="60" cy="60" r="${R}" class="track"/>
    <circle cx="60" cy="60" r="${R}" class="val" stroke-dasharray="${(C * score / 10).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="66" text-anchor="middle" class="num">${esc(text)}</text>
    <text x="60" y="86" text-anchor="middle" class="of">van 10</text>
  </svg>`;
}
