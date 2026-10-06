/* Algemene hulpfuncties voor opmaak en weergave. */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* RDW levert datums als "20230512", 20230512 of "2023-05-12T00:00:00.000". */
  function parseDate(v) {
    if (v == null || v === '') return null;
    const s = String(v);
    let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function fmtDate(v) {
    const d = v instanceof Date ? v : parseDate(v);
    if (!d || isNaN(d)) return v == null ? '' : String(v);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function fmtNum(v, digits) {
    const n = num(v);
    if (n == null) return '';
    return n.toLocaleString('nl-NL', { maximumFractionDigits: digits == null ? 0 : digits });
  }

  function fmtEuro(v) {
    const n = num(v);
    if (n == null) return '';
    return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  }

  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  function ageText(d) {
    if (!d) return '';
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    if (now.getDate() < d.getDate()) months--;
    const y = Math.floor(months / 12), m = months % 12;
    return (y ? y + ' jaar' : '') + (y && m ? ' en ' : '') + (m ? m + ' mnd' : '') || '< 1 mnd';
  }

  // Leesbare labels voor bekende RDW-velden; onbekende velden worden automatisch opgemaakt.
  const LABELS = {
    kenteken: 'Kenteken', voertuigsoort: 'Voertuigsoort', merk: 'Merk', handelsbenaming: 'Model',
    vervaldatum_apk: 'APK vervaldatum', datum_tenaamstelling: 'Laatste tenaamstelling',
    bruto_bpm: 'Bruto BPM', inrichting: 'Inrichting', aantal_zitplaatsen: 'Zitplaatsen',
    eerste_kleur: 'Kleur', tweede_kleur: 'Tweede kleur', aantal_cilinders: 'Cilinders',
    cilinderinhoud: 'Cilinderinhoud (cc)', massa_ledig_voertuig: 'Massa leeg (kg)',
    toegestane_maximum_massa_voertuig: 'Max. massa (kg)', massa_rijklaar: 'Massa rijklaar (kg)',
    maximum_massa_trekken_ongeremd: 'Trekgewicht ongeremd (kg)', maximum_trekken_massa_geremd: 'Trekgewicht geremd (kg)',
    datum_eerste_toelating: 'Eerste toelating', datum_eerste_tenaamstelling_in_nederland: 'Eerste tenaamstelling NL',
    wacht_op_keuren: 'Wacht op keuren', catalogusprijs: 'Catalogusprijs', wam_verzekerd: 'WAM verzekerd',
    aantal_deuren: 'Deuren', aantal_wielen: 'Wielen', lengte: 'Lengte (cm)', breedte: 'Breedte (cm)',
    hoogte_voertuig: 'Hoogte (cm)', wielbasis: 'Wielbasis (cm)', europese_voertuigcategorie: 'EU-categorie',
    typegoedkeuringsnummer: 'Typegoedkeuring', variant: 'Variant', uitvoering: 'Uitvoering',
    vermogen_massarijklaar: 'Vermogen/massa (kW/kg)', export_indicator: 'Geëxporteerd',
    openstaande_terugroepactie_indicator: 'Openstaande terugroepactie', taxi_indicator: 'Taxi',
    jaar_laatste_registratie_tellerstand: 'Laatste tellerstandregistratie (jaar)',
    tellerstandoordeel: 'Tellerstandoordeel', code_toelichting_tellerstand: 'Toelichting tellerstand',
    tenaamstellen_mogelijk: 'Tenaamstellen mogelijk', zuinigheidsclassificatie: 'Energielabel',
    plaats_chassisnummer: 'Plaats chassisnummer', type: 'Type', massa_bedrijfsklaar_maximaal: 'Massa bedrijfsklaar max (kg)',
    brandstof_omschrijving: 'Brandstof', nettomaximumvermogen: 'Vermogen (kW)',
    brandstofverbruik_gecombineerd: 'Verbruik gecombineerd (l/100km)', brandstofverbruik_stad: 'Verbruik stad (l/100km)',
    brandstofverbruik_buiten: 'Verbruik buiten (l/100km)', co2_uitstoot_gecombineerd: 'CO₂ (g/km)',
    co2_uitstoot_gewogen: 'CO₂ gewogen (g/km)', geluidsniveau_stationair: 'Geluid stationair (dB)',
    geluidsniveau_rijdend: 'Geluid rijdend (dB)', emissiecode_omschrijving: 'Euroklasse',
    milieuklasse_eg_goedkeuring_licht: 'Milieuklasse', uitlaatemissieniveau: 'Uitlaatemissieniveau',
    roetuitstoot: 'Roetuitstoot', elektrisch_verbruik_enkel_elektrisch_wltp: 'Elektrisch verbruik WLTP (Wh/km)',
    actie_radius_enkel_elektrisch_wltp: 'Actieradius WLTP (km)', netto_max_vermogen_elektrisch: 'Vermogen elektrisch (kW)',
    brandstof_volgnummer: 'Volgnummer', meld_datum_door_keuringsinstantie: 'Meldingsdatum',
    meld_tijd_door_keuringsinstantie: 'Meldingstijd', soort_erkenning_keuringsinstantie: 'Soort erkenning (code)',
    soort_erkenning_omschrijving: 'Soort erkenning', soort_melding_ki_omschrijving: 'Soort melding',
    vervaldatum_keuring: 'Vervaldatum keuring', gebrek_identificatie: 'Gebrekcode',
    aantal_gebreken_geconstateerd: 'Aantal', gebrek_omschrijving: 'Omschrijving',
    referentiecode_rdw: 'Referentie RDW', code_status: 'Statuscode', status: 'Status',
  };

  function prettyKey(k) {
    if (LABELS[k]) return LABELS[k];
    const s = k.replace(/_dt$/, '').replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function prettyValue(k, v) {
    if (v == null || v === '') return '';
    if (/datum|vervaldatum/.test(k) || /_dt$/.test(k)) return fmtDate(v);
    if (k === 'catalogusprijs' || k === 'bruto_bpm') return fmtEuro(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* Verberg dubbele velden: *_dt naast de tekstversie, en api_*-links. */
  function visibleKeys(row) {
    return Object.keys(row).filter(k => {
      if (/^api_/.test(k) || k.startsWith(':')) return false;
      if (/_dt$/.test(k) && (k.replace(/_dt$/, '') in row)) return false;
      return true;
    });
  }

  function kv(row, keys) {
    keys = keys || visibleKeys(row);
    const items = keys.filter(k => row[k] != null && row[k] !== '')
      .map(k => `<dt>${esc(prettyKey(k))}</dt><dd>${esc(prettyValue(k, row[k]))}</dd>`).join('');
    return items ? `<dl class="kv">${items}</dl>` : '<p class="muted">Geen gegevens.</p>';
  }

  function table(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return `<p class="muted">${esc(opts.empty || 'Geen gegevens.')}</p>`;
    const keys = opts.keys || [...new Set(rows.flatMap(visibleKeys))];
    const head = keys.map(k => `<th>${esc(prettyKey(k))}</th>`).join('');
    const body = rows.map(r => '<tr>' + keys.map(k => {
      const v = prettyValue(k, r[k]);
      if (k === 'kenteken' && r[k]) return `<td><a href="#/k/${esc(r[k])}">${esc(RDW.formatKenteken(r[k]))}</a></td>`;
      return `<td>${esc(v)}</td>`;
    }).join('') + '</tr>').join('');
    return `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /* Horizontale balken: items = [{name, n, hl}] */
  function bars(items, opts) {
    opts = opts || {};
    if (!items.length) return '<p class="muted">Geen gegevens.</p>';
    const max = Math.max(...items.map(i => i.n)) || 1;
    const total = opts.total || items.reduce((s, i) => s + i.n, 0);
    return '<div class="bars">' + items.map(i => `
      <div class="bar-row" title="${esc(i.name)}: ${fmtNum(i.n)}">
        <div class="name">${esc(i.name)}</div>
        <div class="bar-track"><div class="bar-fill${i.hl ? ' hl' : ''}" style="width:${(i.n / max * 100).toFixed(1)}%"></div></div>
        <div class="n">${opts.fmt ? opts.fmt(i.n) : opts.pct ? (i.n / total * 100).toFixed(1) + '%' : fmtNum(i.n)}</div>
      </div>`).join('') + '</div>';
  }

  /* Kolomgrafiek: items = [{x, n, hl}] */
  function columns(items) {
    if (!items.length) return '<p class="muted">Geen gegevens.</p>';
    const max = Math.max(...items.map(i => i.n)) || 1;
    return '<div class="colchart">' + items.map(i => `
      <div class="col${i.hl ? ' hl' : ''}" title="${esc(i.x)}: ${fmtNum(i.n)}">
        <div class="bw"><div class="b" style="height:${(i.n / max * 100).toFixed(1)}%"></div></div>
        <div class="x">${esc(i.x)}</div>
      </div>`).join('') + '</div>';
  }

  /* Vermogens groeperen tot leesbare klassen: "75 pk", "110 pk" … */
  function pkItems(rows, hlPk) {
    const m = {};
    for (const r of rows) {
      const kw = num(r.nettomaximumvermogen);
      if (!kw) continue;
      const pk = Math.round(kw * 1.35962 / 5) * 5;
      m[pk] = (m[pk] || 0) + 1;
    }
    const hl = hlPk ? Math.round(hlPk / 5) * 5 : null;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([pk, n]) => ({ name: pk + ' pk', n, hl: +pk === hl }));
  }

  function stat(label, value, hint) {
    return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${value || '–'}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  }

  function loading(text) { return `<div class="loading"><div class="spinner"></div>${esc(text || 'Laden…')}</div>`; }
  function errorBox(msg) { return `<div class="error">${esc(msg)}</div>`; }

  const RECENT_KEY = 'checkapk.recent';
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
  }
  function addRecent(item) {
    try {
      const list = getRecent().filter(r => r.kenteken !== item.kenteken);
      list.unshift(item);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
    } catch (e) { /* opslag niet beschikbaar */ }
  }

  window.U = {
    esc, parseDate, fmtDate, num, fmtNum, fmtEuro, daysBetween, ageText, prettyKey, prettyValue,
    visibleKeys, kv, table, bars, columns, pkItems, stat, loading, errorBox, getRecent, addRecent,
  };
})();
