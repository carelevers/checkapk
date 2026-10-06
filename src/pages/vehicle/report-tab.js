/** Tabblad "Rapport": het cijfer met uitleg, punten, tips en vergelijking. */
import { verdict } from '../../domain/report-score.js';
import { fmtEuro, fmtNum, fmtScore, num, titleCase } from '../../lib/format.js';
import { getReport } from '../../services/report.js';
import { barChart, scoreRing } from '../../ui/charts.js';
import { esc, loading } from '../../ui/html.js';

/** @typedef {import('../../domain/report-score.js').Report} Report */
/** @typedef {import('./tabs.js').TabContext} TabContext */

const ICON = { good: '✓', warn: '!', bad: '✕' };
const ORDER = { bad: 0, warn: 1, good: 2 };

/** Klein rond cijfer voor in de kop van de pagina. @param {Report} r */
export const scorePillHtml = (r) => `<a class="score-pill ${r.verdict.cls}" href="#" data-goto="rapport" title="Rapportcijfer">
  <b>${fmtScore(r.total)}</b><span>${esc(r.verdict.label)}</span></a>`;

/** Eén zin samenvatting boven het rapport. @param {TabContext['s']} s @param {Report} r */
function summaryLine(s, r) {
  const model = titleCase(s.titel);
  const bad = r.points.filter((p) => p.type === 'bad').length;
  const warn = r.points.filter((p) => p.type === 'warn').length;
  const base = `Deze ${esc(model)}${s.bouwjaar ? ' uit ' + s.bouwjaar : ''}`;
  if (bad) return `${base} heeft ${bad === 1 ? 'een belangrijk aandachtspunt' : bad + ' belangrijke aandachtspunten'}. Lees ze hieronder goed door.`;
  if (r.total >= 8) return `${base} ziet er goed uit: weinig mankementen en geen openstaande problemen.`;
  if (warn) return `${base} is in orde, maar let op ${warn === 1 ? 'één punt' : warn + ' punten'}.`;
  return `${base} is in orde volgens de openbare gegevens.`;
}

/** "Deze auto vs. gemiddeld" regel. */
function versus(mine, avg, lowerBetter, fmt) {
  if (mine == null || avg == null) return '<div class="muted">onbekend</div>';
  const better = lowerBetter ? mine < avg * 0.9 : mine > avg * 1.1;
  const worse = lowerBetter ? mine > avg * 1.1 : mine < avg * 0.9;
  const cls = lowerBetter == null ? '' : better ? 'ok' : worse ? 'warn' : '';
  const word = lowerBetter == null ? (mine > avg * 1.1 ? 'hoger' : mine < avg * 0.9 ? 'lager' : 'gemiddeld') : better ? 'beter' : worse ? 'slechter' : 'gemiddeld';
  return `<div class="vs-row"><div class="vs-mine">${fmt(mine)}</div><div class="vs-avg">gemiddeld ${fmt(avg)}</div><span class="badge ${cls}">${word}</span></div>`;
}

/**
 * @param {HTMLElement} el
 * @param {TabContext} ctx
 */
export async function renderReportTab(el, { s, data }) {
  el.innerHTML = loading('Rapport opstellen en vergelijken met andere auto\'s van dit type…');
  const r = await getReport(s, data);
  if (!el.isConnected) return;
  const model = titleCase(s.titel);
  const points = [...r.points].sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  const st = r.st;
  const firstYear = s.history.length ? s.history[s.history.length - 1].date.getFullYear() : '';

  el.innerHTML = `
    <section class="card report-hero">
      ${scoreRing(r.total, r.verdict.cls, fmtScore(r.total))}
      <div class="report-hero-text">
        <span class="eyebrow-plain">Rapportcijfer</span>
        <h2 class="verdict ${r.verdict.cls}">${esc(r.verdict.label)}</h2>
        <p class="lead">${summaryLine(s, r)}</p>
        <div class="report-actions">
          <button class="btn" data-action="print">Print / opslaan als PDF</button>
          <a class="btn ghost" href="#/vergelijk/${esc(s.kenteken)}">Vergelijk met andere auto</a>
        </div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card"><h2>Belangrijkste punten</h2>
        <ul class="points">${points.map((p) => `<li class="${p.type}"><span class="ic">${ICON[p.type]}</span>${esc(p.text)}</li>`).join('')}</ul>
      </section>
      <section class="card"><h2>Tips voor als je hem wilt kopen</h2>
        <ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </section>
    </div>

    <section class="card"><h2>Zo is het cijfer berekend</h2>
      <div class="cats">${r.cats.map((c) => `
        <div class="cat">
          <div class="cat-head"><b>${esc(c.naam)}</b><span class="cat-score ${verdict(c.score).cls}">${fmtScore(c.score)}</span></div>
          <div class="bar-track"><div class="bar-fill ${verdict(c.score).cls}" style="width:${c.score * 10}%"></div></div>
          <p>${esc(c.why)}</p>
        </div>`).join('')}
      </div>
    </section>

    <div class="grid-2">
      <section class="card"><h2>Wat vond de APK?</h2>
        ${r.groups.length ? `<p class="sub">Alle mankementen sinds ${firstYear}, per onderdeel.</p>
          ${barChart(r.groups)}
          <p class="small"><a href="#" data-goto="apk">Bekijk elke keuring →</a></p>`
          : '<p class="muted">Geen mankementen gevonden bij de APK. 👍</p>'}
      </section>
      <section class="card"><h2>Vergeleken met andere ${esc(model)}s</h2>
        ${st ? `<p class="sub">Vergeleken met ${fmtNum(st.total)} auto's: ${esc(st.groep)}.</p>
          <div class="vs">
            <div class="vs-label">Mankementen per APK</div>${versus(s.gebrekenPerKeuring, st.modelGpk, true, (x) => fmtNum(x, 1))}
            <div class="vs-label">Nieuwprijs</div>${versus(num(s.v.catalogusprijs), st.prijs, null, fmtEuro)}
            <div class="vs-label">CO₂-uitstoot</div>${versus(s.co2, st.co2, true, (x) => fmtNum(x) + ' g/km')}
          </div>
          <p class="small"><a href="#" data-goto="vergelijk">Uitgebreide vergelijking →</a></p>`
          : '<p class="muted">Vergelijking met andere auto\'s niet beschikbaar.</p>'}
      </section>
    </div>
    <p class="small muted disclaimer">Dit cijfer is een indicatie op basis van openbare RDW-gegevens. Het vervangt geen aankoopkeuring. Eigenaren en kilometerstanden per keuring zijn niet openbaar.</p>`;
  el.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());
}
