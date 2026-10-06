/** "Voor experts" (#/datasets): vrije SoQL-query op elke RDW-dataset. */
import { DATASETS } from '../api/datasets.js';
import { buildUrl, query } from '../api/rdw-client.js';
import { fmtNum } from '../lib/format.js';
import { dataTable, errorBox, esc, loading } from '../ui/html.js';

/** @param {HTMLElement} el @param {Record<string, string>} params */
export function renderDatasetsPage(el, params) {
  const options = Object.entries(DATASETS).map(([key, d]) =>
    `<option value="${key}" ${params.ds === key ? 'selected' : ''}>${esc(d.titel)} (${d.id})</option>`).join('');
  el.innerHTML = `<section class="card"><h2>RDW Open Data verkennen</h2>
    <p class="sub">Bevraag elke dataset rechtstreeks met <a href="https://dev.socrata.com/docs/queries/" target="_blank" rel="noopener">SoQL</a>, bijvoorbeeld <code>merk='TESLA' AND datum_eerste_toelating_dt&gt;'2024-01-01'</code>.</p>
    <form class="form-row" data-ds-form>
      <label class="field">Dataset<select name="ds">${options}</select></label>
      <label class="field field-wide">$where<input name="where" value="${esc(params.where || '')}" placeholder="kenteken='12ABC3'"></label>
      <label class="field">$order<input name="order" value="${esc(params.order || '')}"></label>
      <label class="field">$limit<input name="limit" type="number" value="${esc(params.limit || 50)}" min="1" max="50000"></label>
      <button class="btn">Uitvoeren</button>
    </form></section>
    <div data-ds-out></div>
    <section class="card"><h2>Gebruikte datasets</h2>${dataTable(Object.entries(DATASETS).map(([key, d]) => ({ dataset: d.titel, id: d.id, sleutel: key })))}</section>`;
  el.querySelector('[data-ds-form]')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    location.hash = '#/datasets?' + new URLSearchParams(/** @type {any} */ (Object.fromEntries(new FormData(/** @type {HTMLFormElement} */ (ev.target))))).toString();
  });
  if (!params.ds || !(params.ds in DATASETS)) return;

  const out = /** @type {HTMLElement} */ (el.querySelector('[data-ds-out]'));
  out.innerHTML = loading();
  const p = { $where: params.where, $order: params.order, $limit: params.limit || 50 };
  query(params.ds, p).then((rows) => {
    out.innerHTML = `<section class="card"><h2>${fmtNum(rows.length)} resultaten</h2>
      <p class="sub"><a href="${esc(buildUrl(params.ds, p))}" target="_blank" rel="noopener">API-URL openen</a></p>${dataTable(rows)}</section>`;
  }).catch((e) => { out.innerHTML = errorBox(e.message); });
}
