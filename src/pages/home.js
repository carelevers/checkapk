/** Startpagina (#/). */
import { bindPlateSearch, plateSearchHtml } from '../ui/plate-search.js';

const FEATURES = [
  ['#/', 'Rapportcijfer', 'Eén cijfer van 1 tot 10, met in gewone taal wat goed is en waar je op moet letten.'],
  ['#/model', 'APK-geschiedenis', 'Elke keuring sinds 2018 en wat er gerepareerd moest worden. Beter of slechter dan andere auto\'s van hetzelfde type?'],
  ['#/vergelijk', 'Auto\'s vergelijken', 'Twijfel je tussen een paar auto\'s? Zet ze naast elkaar en zie welke het beste scoort.'],
  ['#/vraag', 'Vraag het', '"Meest voorkomende mankementen van een Citroën C3 2010-2017": typ je vraag en krijg direct grafieken.'],
];

/** @param {HTMLElement} el */
export function renderHomePage(el) {
  el.innerHTML = plateSearchHtml() + `<div class="features">${FEATURES.map(([href, title, text]) =>
    `<a class="feature" href="${href}"><b>${title}</b><span>${text}</span></a>`).join('')}</div>`;
  bindPlateSearch(el)?.focus();
}
