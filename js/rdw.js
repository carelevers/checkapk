/* RDW Open Data (Socrata SODA API) client.
 * Alle datasets: https://opendata.rdw.nl  — de API staat CORS toe, dus de
 * browser kan rechtstreeks bevragen; er is geen backend nodig. */
(function () {
  'use strict';

  const BASE = window.RDW_BASE || 'https://opendata.rdw.nl/resource/';
  // Optioneel: eigen Socrata app token (hogere rate limits). Zet in config.js.
  const APP_TOKEN = window.RDW_APP_TOKEN || '';

  const DATASETS = {
    voertuig:            { id: 'm9d7-ebf2', titel: 'Gekentekende voertuigen' },
    brandstof:           { id: '8ys7-d773', titel: 'Brandstof & milieu' },
    carrosserie:         { id: 'vezc-m2t6', titel: 'Carrosserie' },
    carrosserieSpec:     { id: 'jhie-znh9', titel: 'Carrosserie specificatie' },
    voertuigklasse:      { id: 'kmfi-hrps', titel: 'Voertuigklasse' },
    assen:               { id: '3huj-srit', titel: 'Assen' },
    subcategorie:        { id: '2ba7-embk', titel: 'Subcategorie voertuig' },
    bijzonderheden:      { id: '7ug8-2dtt', titel: 'Bijzonderheden' },
    keuringen:           { id: 'sgfe-77wx', titel: 'Meldingen keuringsinstantie (APK)' },
    gebreken:            { id: 'a34c-vvps', titel: 'Geconstateerde gebreken' },
    gebrekOmschrijving:  { id: 'hx2c-gt7k', titel: 'Gebreken (omschrijvingen)' },
    terugroepStatus:     { id: 't49b-isb7', titel: 'Terugroepactie status' },
    terugroepActie:      { id: 'af5r-44mf', titel: 'Terugroepactie' },
    terugroepRisico:     { id: '9ihi-jgpf', titel: 'Terugroepactie risico' },
    terugroepInformeren: { id: '223d-3w9w', titel: 'Terugroepactie informeren eigenaar' },
  };

  // Datasets die per kenteken worden opgehaald (veld "kenteken").
  const PER_KENTEKEN = ['voertuig', 'brandstof', 'carrosserie', 'carrosserieSpec',
    'voertuigklasse', 'assen', 'subcategorie', 'bijzonderheden', 'keuringen',
    'gebreken', 'terugroepStatus'];

  const cache = new Map();

  function url(id, params) {
    const qs = Object.entries(params || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
    return BASE + id + '.json' + (qs ? '?' + qs : '');
  }

  async function query(key, params) {
    const ds = DATASETS[key];
    const id = ds ? ds.id : key;
    const u = url(id, params);
    if (cache.has(u)) return cache.get(u);
    const p = (async () => {
      const headers = { Accept: 'application/json' };
      if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;
      const res = await fetch(u, { headers });
      if (!res.ok) {
        let msg = res.status + ' ' + res.statusText;
        try { const j = await res.json(); if (j.message) msg += ' — ' + j.message; } catch (e) { /* ignore */ }
        throw new Error(msg);
      }
      return res.json();
    })();
    cache.set(u, p);
    p.catch(() => cache.delete(u));
    return p;
  }

  // SoQL string literal
  function lit(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }
  function inList(values) { return '(' + values.map(lit).join(',') + ')'; }

  function normalizeKenteken(input) {
    return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Kenteken opmaken volgens de NL sidecodes, bijv. 12ABC3 -> 12-ABC-3 */
  function formatKenteken(k) {
    k = normalizeKenteken(k);
    const runs = k.match(/[A-Z]+|[0-9]+/g) || [];
    if (runs.length === 3) return runs.join('-');
    if (runs.length === 2) {
      return runs.flatMap(r => (r.length === 4 ? [r.slice(0, 2), r.slice(2)] : [r])).join('-');
    }
    if (runs.length === 1 && k.length === 6) return k.slice(0, 2) + '-' + k.slice(2, 4) + '-' + k.slice(4);
    return k;
  }

  async function fetchAllForKenteken(kenteken) {
    const k = normalizeKenteken(kenteken);
    const entries = await Promise.all(PER_KENTEKEN.map(async key => {
      try {
        const rows = await query(key, { kenteken: k, $limit: 5000 });
        return [key, { rows, error: null }];
      } catch (e) {
        return [key, { rows: [], error: e.message }];
      }
    }));
    const result = Object.fromEntries(entries);

    // Gebrek-omschrijvingen erbij zoeken
    const ids = [...new Set(result.gebreken.rows.map(r => r.gebrek_identificatie).filter(Boolean))];
    result.gebrekOmschrijving = { rows: [], error: null };
    if (ids.length) {
      try {
        result.gebrekOmschrijving.rows = await query('gebrekOmschrijving', {
          $where: 'gebrek_identificatie in' + inList(ids), $limit: 5000,
        });
      } catch (e) { result.gebrekOmschrijving.error = e.message; }
    }

    // Terugroepacties: details per referentiecode
    const refs = [...new Set(result.terugroepStatus.rows.map(r => r.referentiecode_rdw).filter(Boolean))];
    for (const key of ['terugroepActie', 'terugroepRisico', 'terugroepInformeren']) {
      result[key] = { rows: [], error: null };
      if (!refs.length) continue;
      try {
        result[key].rows = await query(key, { $where: 'referentiecode_rdw in' + inList(refs), $limit: 1000 });
      } catch (e) { result[key].error = e.message; }
    }
    return result;
  }

  window.RDW = { BASE, DATASETS, PER_KENTEKEN, query, url, lit, inList, normalizeKenteken, formatKenteken, fetchAllForKenteken };
})();
