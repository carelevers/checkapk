/** AI-samenvatting van een antwoord. De AI krijgt alleen de cijfers uit de grafieken. */
import { fmtNum, titleCase } from '../lib/format.js';
import { chat } from './ollama.js';

/** @typedef {import('./topics.js').Section} Section */

const SYSTEM_PROMPT = `Je bent een ervaren autokenner die een kort, nuttig antwoord schrijft voor een gewone autokoper.
Regels:
- Begin meteen met het antwoord op de vraag.
- Noem hooguit 2 à 3 opvallende cijfers en rond ze af ("ruim 170.000", "ongeveer 4 op de 10"). Som NIET alle cijfers op.
- Geef daarna één inzicht of praktische tip, alleen als die echt uit de cijfers volgt.
- Maximaal 3 zinnen. Geen opsommingstekens, geen kopjes, geen markdown.
- Schrijf namen normaal: "Kia Picanto", niet "KIA PICANTO".
- Gebruik alleen de gegeven gegevens; verzin niets. Percentages bij een steekproef zijn schattingen: zeg dan "ongeveer".

Voorbeeld
Vraag: populairste modellen van Toyota
Gegevens: Yaris: 300.000 (41%), Aygo: 150.000 (21%), Corolla: 90.000 (12%), …
Antwoord: De Yaris is veruit de populairste Toyota in Nederland: ruim 4 op de 10 Toyota's op kenteken is een Yaris. Daarna volgen de Aygo en de Corolla. Zoek je een veelvoorkomende Toyota met veel aanbod en onderdelen, dan zit je met een Yaris goed.`;

/** Getallen in Nederlandse notatie, namen in normale hoofdletters. @param {unknown} v */
function formatValue(v) {
  const s = String(v);
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(s)) return fmtNum(Number(v), Number(v) % 1 ? 2 : 0);
  return /^[A-Z0-9 \-.]+$/.test(s) && /[A-Z]{2}/.test(s) ? titleCase(s) : s;
}

/**
 * Zet de grafiekgegevens om naar leesbare tekst voor de AI, met percentages waar zinvol.
 * @param {Section[]} sections
 */
export function factsFor(sections) {
  return sections.filter((sc) => sc.csv && sc.csv.length > 1).map((sc) => {
    const [head, ...rows] = /** @type {(string|number)[][]} */ (sc.csv);
    const share = head[1] === 'aantal';
    const total = share ? rows.reduce((a, r) => a + (Number(r[1]) || 0), 0) : 0;
    const lines = rows.slice(0, 12).map((r) => '- ' + formatValue(r[0]) + ': ' + r.slice(1).map(formatValue).join(' / ')
      + (share && total ? ` (${Math.round(Number(r[1]) / total * 100)}%)` : ''));
    if (rows.length > 12) lines.push(`- … nog ${rows.length - 12} rijen`);
    const note = share ? ' (percentage = aandeel binnen deze getoonde rijen, niet van alle auto\'s)' : '';
    return `${sc.title}${sc.sub ? ' (' + sc.sub + ')' : ''}\nKolommen: ${head.join(' / ')}${note}\n${lines.join('\n')}`;
  }).join('\n\n');
}

/**
 * @param {string} question
 * @param {Section[]} sections
 * @param {(text: string, thinking: boolean) => void} [onToken] voor woord-voor-woord weergave
 */
export function summarize(question, sections, onToken) {
  return chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Vraag: ${question}\n\nGegevens uit het RDW-register:\n${factsFor(sections)}` },
  ], { timeoutMs: 300000, onToken });
}
