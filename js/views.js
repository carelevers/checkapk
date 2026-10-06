/* Schermen: kentekenpagina, APK-historie, modelanalyse, vergelijken, datasets. */
(function () {
  'use strict';
  const { esc, parseDate, fmtDate, num, fmtNum, fmtEuro, daysBetween, ageText } = U;

  /* ---------- Samenvatting van één voertuig ---------- */

  function dateKey(v) {
    const d = parseDate(v);
    if (!d) return null;
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function gebrekMap(rows) {
    const map = {};
    for (const r of rows || []) {
      const prev = map[r.gebrek_identificatie];
      if (!prev || String(r.ingangsdatum_gebrek || '') > String(prev.ingangsdatum_gebrek || '')) map[r.gebrek_identificatie] = r;
    }
    return map;
  }

  function buildApkHistory(data) {
    const events = new Map();
    const get = (k) => {
      if (!events.has(k)) events.set(k, { key: k, keuringen: [], gebreken: [] });
      return events.get(k);
    };
    for (const r of data.keuringen.rows) {
      const k = dateKey(r.meld_datum_door_keuringsinstantie_dt || r.meld_datum_door_keuringsinstantie);
      if (k) get(k).keuringen.push(r);
    }
    for (const r of data.gebreken.rows) {
      const k = dateKey(r.meld_datum_door_keuringsinstantie_dt || r.meld_datum_door_keuringsinstantie);
      if (k) get(k).gebreken.push(r);
    }
    return [...events.values()].sort((a, b) => b.key - a.key).map(e => {
      e.date = parseDate(String(e.key));
      e.aantalGebreken = e.gebreken.reduce((s, g) => s + (num(g.aantal_gebreken_geconstateerd) || 1), 0);
      return e;
    });
  }

  function summarize(data) {
    const v = data.voertuig.rows[0] || {};
    const fuel = data.brandstof.rows;
    const history = buildApkHistory(data);
    const keuringen = history.filter(e => e.keuringen.length).length || history.length;
    const totaalGebreken = history.reduce((s, e) => s + e.aantalGebreken, 0);
    const kw = Math.max(0, ...fuel.map(f => num(f.nettomaximumvermogen) || num(f.netto_max_vermogen_elektrisch) || 0)) || null;
    const pick = (field) => { for (const f of fuel) if (f[field] != null && f[field] !== '') return f[field]; return null; };
    const apk = parseDate(v.vervaldatum_apk_dt || v.vervaldatum_apk);
    const toelating = parseDate(v.datum_eerste_toelating_dt || v.datum_eerste_toelating);
    return {
      v, history,
      kenteken: v.kenteken,
      titel: [v.merk, v.handelsbenaming].filter(Boolean).join(' '),
      brandstof: [...new Set(fuel.map(f => f.brandstof_omschrijving).filter(Boolean))].join(' + '),
      kw, pk: kw ? Math.round(kw * 1.35962) : null,
      co2: num(pick('co2_uitstoot_gecombineerd')) ?? num(pick('co2_uitstoot_gewogen')),
      verbruik: num(pick('brandstofverbruik_gecombineerd')),
      euroklasse: pick('emissiecode_omschrijving'),
      bereik: num(pick('actie_radius_enkel_elektrisch_wltp')),
      apk, toelating,
      bouwjaar: toelating ? toelating.getFullYear() : null,
      eigenaarSinds: parseDate(v.datum_tenaamstelling_dt || v.datum_tenaamstelling),
      keuringen, totaalGebreken,
      gebrekenPerKeuring: keuringen ? totaalGebreken / keuringen : null,
      terugroepOpen: data.terugroepStatus.rows.filter(r => !/hersteld|afgesloten|uitgevoerd/i.test(r.status || '')).length,
      terugroepTotaal: data.terugroepStatus.rows.length,
    };
  }

  function apkBadge(s) {
    if (!s.apk) return '<span class="badge">APK onbekend</span>';
    const d = daysBetween(new Date(), s.apk);
    if (d < 0) return `<span class="badge bad">● APK verlopen sinds ${fmtDate(s.apk)}</span>`;
    if (d <= 60) return `<span class="badge warn">● APK verloopt over ${d} dagen</span>`;
    return `<span class="badge ok">● APK geldig t/m ${fmtDate(s.apk)}</span>`;
  }

  function yesNoBadge(value, label, goodWhen) {
    if (value == null || value === '') return '';
    const yes = /^(ja|j|true)$/i.test(value);
    const good = goodWhen === 'ja' ? yes : !yes;
    return `<span class="badge ${good ? 'ok' : 'bad'}">${esc(label)}: ${esc(value)}</span>`;
  }

  /* ---------- Kentekenpagina ---------- */

  const SUBTABS = [
    ['rapport', 'Rapport'], ['overzicht', 'Overzicht'], ['apk', 'APK-keuringen'], ['terugroep', 'Terugroepacties'],
    ['milieu', 'Verbruik & milieu'], ['techniek', 'Specificaties'], ['vergelijk', 'Vergelijk met zelfde type'], ['data', 'Alle gegevens'],
  ];

  async function kentekenPage(el, kenteken, tab) {
    const k = RDW.normalizeKenteken(kenteken);
    el.innerHTML = searchHero(k) + `<div id="result">${U.loading('RDW-gegevens ophalen voor ' + RDW.formatKenteken(k) + '…')}</div>`;
    bindSearch(el);
    const res = el.querySelector('#result');
    let data;
    try {
      data = await RDW.fetchAllForKenteken(k);
    } catch (e) {
      res.innerHTML = U.errorBox('Ophalen mislukt: ' + e.message);
      return;
    }
    if (data.voertuig.error) {
      res.innerHTML = U.errorBox('De RDW API gaf een fout: ' + data.voertuig.error);
      return;
    }
    if (!data.voertuig.rows.length) {
      res.innerHTML = `<div class="card empty-state"><h2>Geen voertuig gevonden</h2><p class="muted">Kenteken <span class="plate-badge">${esc(RDW.formatKenteken(k))}</span> staat niet in het RDW-register (of is nog niet gepubliceerd).</p></div>`;
      return;
    }
    const s = summarize(data);
    U.addRecent({ kenteken: k, titel: s.titel });

    const counts = { apk: s.history.length, terugroep: s.terugroepTotaal };
    res.innerHTML = vehicleHeader(s) + `
      <div class="subtabs" role="tablist">${SUBTABS.map(([id, label]) =>
        `<button data-tab="${id}" class="${id === tab ? 'active' : ''}">${label}${counts[id] ? `<span class="count">${counts[id]}</span>` : ''}</button>`).join('')}
      </div><div id="tabbody" class="fade-in"></div>`;

    const body = res.querySelector('#tabbody');
    const show = (t) => {
      res.querySelectorAll('.subtabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      history.replaceState(null, '', '#/k/' + k + (t && t !== 'rapport' ? '/' + t : ''));
      body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in');
      ({
        rapport: () => { Report.renderTab(body, s, data); },
        overzicht: () => { body.innerHTML = overviewTab(s, data); },
        apk: () => { body.innerHTML = apkTab(s, data); },
        terugroep: () => { body.innerHTML = recallTab(data); },
        milieu: () => { body.innerHTML = fuelTab(data); },
        techniek: () => { body.innerHTML = techTab(data); },
        vergelijk: () => { body.innerHTML = U.loading('Vergelijkgroep bepalen…'); resolvePeerFilter(s).then(f => modelAnalysis(body, f, s)); },
        data: () => { body.innerHTML = rawTab(data, k); },
      }[t] || (() => {}))();
      body.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); show(a.dataset.goto); }));
    };
    res.querySelectorAll('.subtabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
    show(SUBTABS.some(([id]) => id === tab) ? tab : 'rapport');
    Report.compute(s, data).then(r => { const pill = res.querySelector('#scorePill'); if (pill) pill.innerHTML = Report.pill(r); }).catch(() => {});
  }

  function vehicleHeader(s) {
    const v = s.v;
    const meta = [v.voertuigsoort, v.inrichting, v.eerste_kleur && v.eerste_kleur !== 'N.v.t.' ? v.eerste_kleur : null,
      s.bouwjaar, s.brandstof].filter(Boolean).map(esc).join(' · ');
    return `<section class="card hero-card">
      <div class="vehicle-head">
        <span class="plate-badge big"><i>NL</i>${esc(RDW.formatKenteken(s.kenteken))}</span>
        <div><h1>${esc(s.titel || 'Onbekend voertuig')}</h1><div class="meta">${meta}</div></div>
        <div id="scorePill" class="score-pill-slot"></div>
        <a class="btn ghost" href="#/vergelijk/${esc(s.kenteken)}">+ Vergelijk</a>
      </div>
      <div class="badges">
        ${apkBadge(s)}
        ${v.wam_verzekerd ? (/ja/i.test(v.wam_verzekerd) ? '<span class="badge ok">Verzekerd</span>' : '<span class="badge warn">Niet verzekerd</span>') : ''}
        ${s.terugroepTotaal ? (s.terugroepOpen ? `<span class="badge bad">${s.terugroepOpen} terugroepactie${s.terugroepOpen > 1 ? 's' : ''} open</span>` : '<span class="badge ok">Geen open terugroepacties</span>')
          : (/ja/i.test(v.openstaande_terugroepactie_indicator || '') ? '<span class="badge bad">Terugroepactie open</span>' : '<span class="badge ok">Geen open terugroepacties</span>')}
        ${/onlogisch/i.test(v.tellerstandoordeel || '') ? '<span class="badge bad">Kilometerstand onlogisch</span>' : /logisch/i.test(v.tellerstandoordeel || '') ? '<span class="badge ok">Kilometerstand klopt</span>' : ''}
        ${/ja/i.test(v.export_indicator || '') ? '<span class="badge bad">Geëxporteerd</span>' : ''}
        ${/ja/i.test(v.taxi_indicator || '') ? '<span class="badge warn">(Ex-)taxi</span>' : ''}
        ${/ja/i.test(v.wacht_op_keuren || '') ? '<span class="badge warn">Wacht op keuren</span>' : ''}
        ${/nee/i.test(v.tenaamstellen_mogelijk || '') ? '<span class="badge bad">Tenaamstellen niet mogelijk</span>' : ''}
      </div>
    </section>`;
  }

  function overviewTab(s, data) {
    const v = s.v;
    const last = s.history[0];
    return `
      <div class="stats bento">
        ${U.stat('Leeftijd', s.toelating ? esc(ageText(s.toelating)) : '', s.toelating ? 'sinds ' + fmtDate(s.toelating) : '')}
        ${U.stat('Vermogen', s.kw ? `${fmtNum(s.pk)} pk` : '', s.kw ? fmtNum(s.kw) + ' kW' : '')}
        ${U.stat('Catalogusprijs', fmtEuro(v.catalogusprijs), v.bruto_bpm ? 'BPM ' + fmtEuro(v.bruto_bpm) : '')}
        ${U.stat('Gewicht', v.massa_rijklaar ? fmtNum(v.massa_rijklaar) + ' kg' : '', v.cilinderinhoud ? fmtNum(v.cilinderinhoud) + ' cc' : '')}
        ${U.stat('Op naam sinds', s.eigenaarSinds ? fmtDate(s.eigenaarSinds) : '', s.eigenaarSinds ? esc(ageText(s.eigenaarSinds)) : '')}
        ${U.stat('APK-keuringen', fmtNum(s.history.length), last ? 'laatste ' + fmtDate(last.date) : '')}
        ${U.stat('Mankementen bij APK', fmtNum(s.totaalGebreken), s.gebrekenPerKeuring != null ? fmtNum(s.gebrekenPerKeuring, 1) + ' per keuring' : '')}
        ${U.stat('CO₂', s.co2 != null ? fmtNum(s.co2) + ' g/km' : '', s.euroklasse ? 'Euro ' + esc(s.euroklasse) : '')}
      </div>
      <div class="grid-2">
        <section class="card"><h2>Voertuig</h2>${U.kv(v, ['merk', 'handelsbenaming', 'voertuigsoort', 'inrichting', 'eerste_kleur', 'tweede_kleur',
          'aantal_zitplaatsen', 'aantal_deuren', 'datum_eerste_toelating', 'datum_eerste_tenaamstelling_in_nederland', 'datum_tenaamstelling',
          'vervaldatum_apk', 'zuinigheidsclassificatie', 'catalogusprijs', 'bruto_bpm'])}</section>
        <section class="card"><h2>Laatste APK-keuringen</h2>${apkTimeline(s.history.slice(0, 4), data)}
          ${s.history.length > 4 ? `<p><a href="#" data-goto="apk">Alle keuringen (${s.history.length}) →</a></p>` : ''}</section>
      </div>`;
  }

  /* ---------- APK-historie ---------- */

  function apkTimeline(history, data) {
    if (!history.length) return '<p class="muted">Geen APK-keuringen gevonden.</p>';
    const omschr = gebrekMap(data.gebrekOmschrijving.rows);
    return '<ul class="timeline">' + history.map(e => {
      const k = e.keuringen[0] || {};
      const soortRaw = k.soort_melding_ki_omschrijving || k.soort_erkenning_omschrijving || '';
      const soort = /periodiek|apk/i.test(soortRaw) || !soortRaw ? 'APK-keuring' : soortRaw.charAt(0).toUpperCase() + soortRaw.slice(1);
      const verval = k.vervaldatum_keuring_dt || k.vervaldatum_keuring;
      const cls = e.aantalGebreken === 0 ? '' : e.aantalGebreken >= 4 ? 'bad' : 'warn';
      const defects = e.gebreken.map(g => {
        const o = omschr[g.gebrek_identificatie] || {};
        const n = num(g.aantal_gebreken_geconstateerd) || 1;
        return `<li><span class="cat-chip">${esc(Report.categorize(o.gebrek_omschrijving))}</span><span>${n > 1 ? `<b>${n}×</b> ` : ''}${esc(o.gebrek_omschrijving || 'Mankement')}</span></li>`;
      }).join('');
      return `<li><span class="dot ${cls}"></span>
        <div class="when">${fmtDate(e.date)}</div>
        <div class="what">${esc(soort)} · ${e.aantalGebreken ? `<b>${e.aantalGebreken} mankement${e.aantalGebreken > 1 ? 'en' : ''} gevonden</b>` : 'zonder mankementen'}${verval ? ' · goedgekeurd t/m ' + fmtDate(verval) : ''}</div>
        ${defects ? `<ul class="defects">${defects}</ul>` : ''}</li>`;
    }).join('') + '</ul>';
  }

  function apkTab(s, data) {
    const omschr = gebrekMap(data.gebrekOmschrijving.rows);
    const perYear = {};
    const perGebrek = {};
    for (const e of s.history) {
      const y = e.date.getFullYear();
      perYear[y] = (perYear[y] || 0) + e.aantalGebreken;
      for (const g of e.gebreken) {
        const key = g.gebrek_identificatie;
        perGebrek[key] = (perGebrek[key] || 0) + (num(g.aantal_gebreken_geconstateerd) || 1);
      }
    }
    const years = Object.keys(perYear).map(Number).sort();
    const yearItems = years.length ? Array.from({ length: years[years.length - 1] - years[0] + 1 }, (_, i) => years[0] + i)
      .map(y => ({ x: String(y), n: perYear[y] || 0 })) : [];
    const topGebreken = Object.entries(perGebrek).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, n]) => ({ name: (omschr[id] && omschr[id].gebrek_omschrijving) || id, n }));
    const metGebreken = s.history.filter(e => e.aantalGebreken > 0).length;

    return `
      <div class="stats bento">
        ${U.stat('APK geldig tot', s.apk ? fmtDate(s.apk) : '', s.apk ? (daysBetween(new Date(), s.apk) >= 0 ? 'nog ' + daysBetween(new Date(), s.apk) + ' dagen' : 'verlopen') : '')}
        ${U.stat('Keuringen', fmtNum(s.history.length))}
        ${U.stat('Met mankementen', fmtNum(metGebreken), s.history.length ? Math.round(metGebreken / s.history.length * 100) + '% van de keuringen' : '')}
        ${U.stat('Mankementen totaal', fmtNum(s.totaalGebreken), s.gebrekenPerKeuring != null ? fmtNum(s.gebrekenPerKeuring, 1) + ' per keuring' : '')}
        ${U.stat('Kilometerstand', esc(s.v.tellerstandoordeel || ''), s.v.jaar_laatste_registratie_tellerstand ? 'laatst geregistreerd ' + esc(s.v.jaar_laatste_registratie_tellerstand) : '')}
      </div>
      <div class="grid-2">
        <section class="card"><h2>Mankementen per jaar</h2>${U.columns(yearItems)}</section>
        <section class="card"><h2>Wat werd het vaakst gevonden?</h2>${U.bars(topGebreken)}</section>
      </div>
      <section class="card"><h2>Alle keuringen</h2>
        <p class="sub">Elke APK-keuring met wat er gevonden is. Nieuwste bovenaan.</p>
        ${apkTimeline(s.history, data)}
        ${data.keuringen.error ? U.errorBox('Keuringen: ' + data.keuringen.error) : ''}
        ${data.gebreken.error ? U.errorBox('Gebreken: ' + data.gebreken.error) : ''}
      </section>`;
  }

  /* ---------- Overige tabs ---------- */

  function recallTab(data) {
    const status = data.terugroepStatus.rows;
    if (!status.length) {
      return `<section class="card"><h2>Terugroepacties</h2><p class="muted">Geen terugroepacties bekend voor dit voertuig.</p>
        ${data.terugroepStatus.error ? U.errorBox(data.terugroepStatus.error) : ''}</section>`;
    }
    const byRef = (rows) => Object.fromEntries((rows || []).map(r => [r.referentiecode_rdw, r]));
    const actie = byRef(data.terugroepActie.rows), risico = byRef(data.terugroepRisico.rows), info = byRef(data.terugroepInformeren.rows);
    return status.map(st => {
      const ref = st.referentiecode_rdw;
      const open = !/hersteld|afgesloten|uitgevoerd/i.test(st.status || '');
      const detail = Object.assign({}, actie[ref] || {}, risico[ref] || {}, info[ref] || {});
      return `<section class="card"><h2>${esc(ref || 'Terugroepactie')} <span class="badge ${open ? 'bad' : 'ok'}">${esc(st.status || st.code_status || '')}</span></h2>
        ${U.kv(detail)}</section>`;
    }).join('');
  }

  function fuelTab(data) {
    const rows = data.brandstof.rows;
    if (!rows.length) return '<section class="card"><p class="muted">Geen brandstofgegevens.</p></section>';
    return rows.map(r => `<section class="card"><h2>${esc(r.brandstof_omschrijving || 'Brandstof')}</h2>${U.kv(r)}</section>`).join('');
  }

  function techTab(data) {
    const v = data.voertuig.rows[0] || {};
    const section = (title, ds) => {
      const rows = data[ds].rows;
      if (!rows.length) return '';
      return `<section class="card"><h2>${esc(title)}</h2>${rows.length === 1 ? U.kv(rows[0]) : U.table(rows)}</section>`;
    };
    return `<section class="card"><h2>Afmetingen & gewichten</h2>${U.kv(v, ['lengte', 'breedte', 'hoogte_voertuig', 'wielbasis',
        'massa_ledig_voertuig', 'massa_rijklaar', 'toegestane_maximum_massa_voertuig', 'maximum_massa_trekken_ongeremd',
        'maximum_trekken_massa_geremd', 'aantal_cilinders', 'cilinderinhoud', 'vermogen_massarijklaar', 'aantal_wielen',
        'europese_voertuigcategorie', 'typegoedkeuringsnummer', 'variant', 'uitvoering', 'plaats_chassisnummer'])}</section>
      ${section('Carrosserie', 'carrosserie')}${section('Carrosserie specificatie', 'carrosserieSpec')}
      ${section('Voertuigklasse', 'voertuigklasse')}${section('Subcategorie', 'subcategorie')}
      ${section('Assen', 'assen')}${section('Bijzonderheden', 'bijzonderheden')}`;
  }

  function rawTab(data, k) {
    const keys = Object.keys(data);
    return keys.map(key => {
      const ds = RDW.DATASETS[key];
      const d = data[key];
      const link = `https://opendata.rdw.nl/d/${ds.id}`;
      return `<section class="card"><h2>${esc(ds.titel)} <span class="muted small">(${d.rows.length})</span></h2>
        <p class="sub"><a href="${link}" target="_blank" rel="noopener">${ds.id}</a></p>
        ${d.error ? U.errorBox(d.error) : U.table(d.rows, { empty: 'Geen records voor ' + RDW.formatKenteken(k) })}</section>`;
    }).join('');
  }

  /* ---------- Modelanalyse / vergelijken met hetzelfde type ---------- */

  /* Generatie herkennen via de typegoedkeuring: "e2*2001/116*0293*15" -> "e2*2001/116*0293".
   * Het laatste deel is een uitbreiding (facelift, nieuwe motor); een nieuwe generatie krijgt
   * een nieuw basisnummer. Eén generatie kan wel meerdere basisnummers hebben (bijv. per carrosserie). */
  function tgkBase(v) {
    if (!v) return '';
    const parts = String(v).trim().split('*');
    return parts.length >= 4 ? parts.slice(0, 3).join('*') : String(v).trim();
  }

  const MIN_GROEP = 30;

  /* Kies de vergelijkgroep voor een auto, van zo precies mogelijk naar ruimer:
   * 1) zelfde generatie + bouwjaar ±2, 2) zelfde generatie, 3) bouwjaar ±1, 4) hele model. */
  function resolvePeerFilter(s) {
    if (s._peer) return s._peer;
    const base = { merk: s.v.merk || '', model: s.v.handelsbenaming || '' };
    const b = s.bouwjaar;
    const tgk = tgkBase(s.v.typegoedkeuringsnummer);
    const gen = tgk ? { tgk } : s.v.type ? { type: s.v.type } : null;
    const genTxt = tgk ? 'zelfde generatie (typegoedkeuring ' + tgk + ')' : 'zelfde type (' + s.v.type + ')';
    const cands = [];
    if (gen && b) cands.push({ ...base, ...gen, van: b - 2, tot: b + 2, groep: `${genTxt}, bouwjaar ${b - 2}–${b + 2}` });
    if (gen) cands.push({ ...base, ...gen, van: '', tot: '', groep: `${genTxt}, alle bouwjaren` });
    if (b) cands.push({ ...base, van: b - 1, tot: b + 1, groep: `bouwjaar ${b - 1}–${b + 1} (generatie onbekend)` });
    cands.push({ ...base, van: '', tot: '', groep: 'alle bouwjaren' });
    s._peer = (async () => {
      let fallback = cands[cands.length - 1];
      for (const f of cands) {
        try {
          const r = await RDW.query('voertuig', { $select: 'count(*) as n', $where: modelWhere(f, true) });
          const n = num(r[0] && r[0].n) || 0;
          if (n > MIN_GROEP) return f;          // > want de auto zelf telt mee
          if (n > 1 && fallback === cands[cands.length - 1]) fallback = f;
        } catch (e) { /* volgende proberen */ }
      }
      return fallback;
    })();
    return s._peer;
  }

  /* Generaties/uitvoeringen van een model, met de jaren waarin ze vooral geregistreerd zijn. */
  async function generations(f) {
    const where = modelWhere({ merk: f.merk, model: f.model }, false);
    const sel = (cols) => ({ $select: cols + ', date_extract_y(datum_eerste_toelating_dt) as jaar, count(*) as n', $where: where, $group: cols + ', jaar', $limit: 50000 });
    let rows;
    try { rows = await RDW.query('voertuig', sel('typegoedkeuringsnummer, type')); }
    catch (e) { rows = await RDW.query('voertuig', sel('typegoedkeuringsnummer')); }
    const groups = {};
    let total = 0;
    for (const r of rows) {
      const n = num(r.n) || 0;
      const tgk = tgkBase(r.typegoedkeuringsnummer);
      const key = tgk || (r.type ? 'type:' + r.type : 'onbekend');
      const g = groups[key] = groups[key] || { key, tgk, type: r.type || '', types: new Set(), years: {}, n: 0 };
      if (r.type) g.types.add(r.type);
      if (r.jaar) g.years[r.jaar] = (g.years[r.jaar] || 0) + n;
      g.n += n; total += n;
    }
    const list = Object.values(groups).map(g => {
      // Jaren waarin 90% van de auto's geregistreerd is (5e–95e percentiel): imports/naregistraties tellen dan niet mee.
      const ys = Object.keys(g.years).map(Number).sort((a, b) => a - b);
      const sum = ys.reduce((a, y) => a + g.years[y], 0);
      let acc = 0, p5 = null, p95 = null;
      for (const y of ys) {
        acc += g.years[y];
        if (p5 == null && acc >= sum * 0.05) p5 = y;
        if (p95 == null && acc >= sum * 0.95) p95 = y;
      }
      return { ...g, types: [...g.types], van: p5, tot: p95, min: ys[0], max: ys[ys.length - 1], share: total ? g.n / total : 0 };
    }).filter(g => g.share >= 0.005 || g.n >= 50).sort((a, b) => (a.van || 9999) - (b.van || 9999) || b.n - a.n);
    return { list, total };
  }

  function modelWhere(f, withYears) {
    const parts = [];
    if (f.merk) parts.push('merk=' + RDW.lit(f.merk.toUpperCase()));
    if (f.model) parts.push('handelsbenaming=' + RDW.lit(f.model.toUpperCase()));
    if (withYears && f.tgk) parts.push('typegoedkeuringsnummer like ' + RDW.lit(f.tgk + '*%'));
    else if (withYears && f.type) parts.push('type=' + RDW.lit(f.type));
    if (withYears && f.van) parts.push(`datum_eerste_toelating_dt>='${f.van}-01-01T00:00:00'`);
    if (withYears && f.tot) parts.push(`datum_eerste_toelating_dt<='${f.tot}-12-31T23:59:59'`);
    return parts.join(' AND ');
  }

  const SAMPLE = 250;

  async function modelAnalysis(el, f, self) {
    el.innerHTML = `<section class="card">
      <h2>${self ? 'Vergelijk met hetzelfde type' : 'Modelanalyse'}</h2>
      <p class="sub">Statistieken over alle geregistreerde voertuigen van dit merk en model in Nederland, en APK-gebreken over een steekproef van ${SAMPLE} auto's.</p>
      <form class="form-row" id="modelForm">
        <input type="hidden" name="tgk" value="${esc(f.tgk || '')}"><input type="hidden" name="type" value="${esc(f.tgk ? '' : f.type || '')}">
        <label class="field">Merk<input name="merk" value="${esc(f.merk)}" placeholder="bijv. VOLKSWAGEN" required></label>
        <label class="field">Model<input name="model" value="${esc(f.model)}" placeholder="bijv. GOLF"></label>
        <label class="field">Bouwjaar van<input name="van" type="number" min="1900" max="2100" value="${esc(f.van)}"></label>
        <label class="field">tot<input name="tot" type="number" min="1900" max="2100" value="${esc(f.tot)}"></label>
        <button class="btn">Analyseer</button>
      </form>
      ${f.tgk || f.type ? `<p class="gen-chip-row"><span class="gen-chip">Alleen ${f.tgk ? 'generatie ' + esc(f.tgk) : 'type ' + esc(f.type)} <button type="button" id="genClear" title="Alle generaties">✕</button></span></p>` : ''}
      ${f.groep ? `<p class="small muted">Automatisch gekozen vergelijkgroep: ${esc(f.groep)}.</p>` : ''}
      </section><div id="genOut"></div><div id="modelOut"></div>`;
    const form = el.querySelector('#modelForm');
    const out = el.querySelector('#modelOut');
    const run = (nf) => {
      if (!self) location.hash = '#/model?' + new URLSearchParams(Object.entries(nf).filter(([, v]) => v !== '' && v != null)).toString();
      else modelAnalysis(el, nf, self);
    };
    form.addEventListener('submit', ev => { ev.preventDefault(); run(Object.fromEntries(new FormData(form))); });
    const clear = el.querySelector('#genClear');
    if (clear) clear.addEventListener('click', () => run({ ...Object.fromEntries(new FormData(form)), tgk: '', type: '' }));
    if (f.merk && f.model) renderGenerations(el.querySelector('#genOut'), f, self, run);
    if (f.merk) runModelAnalysis(out, f, self);
  }

  async function renderGenerations(el, f, self, run) {
    el.innerHTML = U.loading('Generaties opzoeken…');
    let g;
    try { g = await generations(f); } catch (e) { el.innerHTML = ''; return; }
    if (!g.list.length) { el.innerHTML = ''; return; }
    const selfKey = self ? (tgkBase(self.v.typegoedkeuringsnummer) || (self.v.type ? 'type:' + self.v.type : '')) : '';
    const activeKey = f.tgk || (f.type ? 'type:' + f.type : '');
    el.innerHTML = `<section class="card"><h2>Generaties en uitvoeringen van de ${esc(f.model.toUpperCase())}</h2>
      <p class="sub">Herkend aan de Europese typegoedkeuring. Jaren = waarin 90% van deze auto's voor het eerst op kenteken kwam (later geïmporteerde exemplaren tellen niet mee).</p>
      <div class="table-wrap"><table class="data gens"><thead><tr><th>Vooral gebouwd</th><th class="num">Aantal</th><th>Type</th><th>Typegoedkeuring</th><th></th></tr></thead><tbody>
      ${g.list.map(x => `<tr class="${x.key === activeKey ? 'active' : ''}">
        <td><b>${x.van && x.tot ? (x.van === x.tot ? x.van : x.van + '–' + x.tot) : '?'}</b>${x.min && x.max && (x.min < x.van || x.max > x.tot) ? ` <span class="muted small">(${x.min}–${x.max})</span>` : ''}
          ${x.key === selfKey ? ' <span class="badge ok">deze auto</span>' : ''}</td>
        <td class="num">${fmtNum(x.n)}</td><td>${esc(x.types.join(', '))}</td><td><code>${esc(x.tgk || '–')}</code></td>
        <td>${x.key === activeKey ? '<span class="muted small">geselecteerd</span>' : `<button class="btn ghost btn-sm" data-key="${esc(x.key)}">Alleen deze</button>`}</td></tr>`).join('')}
      </tbody></table></div></section>`;
    el.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => {
      const x = g.list.find(i => i.key === b.dataset.key);
      run({ merk: f.merk, model: f.model, tgk: x.tgk, type: x.tgk ? '' : x.type, van: '', tot: '' });
    }));
  }

  function describeFilter(f) {
    const gen = f.tgk ? 'generatie ' + f.tgk : f.type ? 'type ' + f.type : '';
    const jr = f.van || f.tot ? `bouwjaar ${f.van || '…'}–${f.tot || '…'}` : 'alle bouwjaren';
    return [gen, jr].filter(Boolean).join(', ');
  }

  async function safe(p) { try { return await p; } catch (e) { return { error: e.message }; } }

  /* Statistieken over hetzelfde merk/model/bouwjaar (gedeeld door rapport en modelanalyse). */
  async function computeModelStats(f, self) {
    const whereAll = modelWhere(f, false);
    const where = modelWhere(f, true);
    const q = (key, params) => safe(RDW.query(key, params));

    const [cntAll, cnt, perJaar, perKleur, sample] = await Promise.all([
      q('voertuig', { $select: 'count(*) as n', $where: whereAll }),
      q('voertuig', { $select: 'count(*) as n', $where: where }),
      q('voertuig', { $select: 'date_extract_y(datum_eerste_toelating_dt) as jaar, count(*) as n', $where: whereAll, $group: 'jaar', $order: 'jaar', $limit: 200 }),
      q('voertuig', { $select: 'eerste_kleur, count(*) as n', $where: where, $group: 'eerste_kleur', $order: 'n DESC', $limit: 12 }),
      q('voertuig', { $where: where, $limit: 1000 }),
    ]);
    if (sample.error) return { error: 'Ophalen mislukt: ' + sample.error };
    if (!sample.length) return { empty: true };

    const total = cnt.error ? sample.length : num(cnt[0] && cnt[0].n);
    const totalAll = cntAll.error ? null : num(cntAll[0] && cntAll[0].n);
    const now = new Date();
    const avg = (arr) => { const a = arr.filter(x => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
    const pct = (pred) => sample.filter(pred).length / sample.length * 100;
    const prijs = avg(sample.map(r => num(r.catalogusprijs)).filter(n => n > 0));
    const massa = avg(sample.map(r => num(r.massa_rijklaar)));
    const apkVerlopen = pct(r => { const d = parseDate(r.vervaldatum_apk_dt || r.vervaldatum_apk); return d && d < now; });
    const export_ = pct(r => /ja/i.test(r.export_indicator || ''));
    const terugroep = pct(r => /ja/i.test(r.openstaande_terugroepactie_indicator || ''));
    const onlogisch = pct(r => /onlogisch/i.test(r.tellerstandoordeel || ''));
    const count = (field) => {
      const m = {};
      for (const r of sample) { const v = r[field]; if (v && v !== 'Niet geregistreerd' && v !== 'N.v.t.') m[v] = (m[v] || 0) + 1; }
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, n }));
    };

    // Steekproef voor APK-gebreken: neem kentekens verspreid over de resultaten.
    const step = Math.max(1, Math.floor(sample.length / SAMPLE));
    const kentekens = sample.filter((_, i) => i % step === 0).slice(0, SAMPLE).map(r => r.kenteken);
    if (self && !kentekens.includes(self.kenteken)) kentekens.push(self.kenteken);
    const inK = 'kenteken in' + RDW.inList(kentekens);
    const [gebrekTop, gebrekPerAuto, keuringPerAuto, fuel] = await Promise.all([
      q('gebreken', { $select: 'gebrek_identificatie, count(*) as n', $where: inK, $group: 'gebrek_identificatie', $order: 'n DESC', $limit: 15 }),
      q('gebreken', { $select: 'kenteken, count(*) as n', $where: inK, $group: 'kenteken', $limit: 5000 }),
      q('keuringen', { $select: 'kenteken, count(*) as n', $where: inK, $group: 'kenteken', $limit: 5000 }),
      q('brandstof', { $where: inK, $limit: 5000 }),
    ]);
    let omschr = {};
    if (!gebrekTop.error && gebrekTop.length) {
      const o = await q('gebrekOmschrijving', { $where: 'gebrek_identificatie in' + RDW.inList(gebrekTop.map(g => g.gebrek_identificatie)), $limit: 1000 });
      if (!o.error) omschr = gebrekMap(o);
    }

    const others = kentekens.filter(k => !self || k !== self.kenteken);
    const mapN = (rows) => Object.fromEntries((rows.error ? [] : rows).map(r => [r.kenteken, num(r.n) || 0]));
    const gPer = mapN(gebrekPerAuto), kPer = mapN(keuringPerAuto);
    const totG = others.reduce((s, k) => s + (gPer[k] || 0), 0);
    const totK = others.reduce((s, k) => s + (kPer[k] || 0), 0);
    const modelGpk = totK ? totG / totK : null;
    const zonderGebreken = others.filter(k => kPer[k] && !gPer[k]).length;
    const metKeuring = others.filter(k => kPer[k]).length;

    const fuelRows = fuel.error ? [] : fuel.filter(r => !self || r.kenteken !== self.kenteken);
    const fuelCount = {};
    for (const r of fuelRows) fuelCount[r.brandstof_omschrijving] = (fuelCount[r.brandstof_omschrijving] || 0) + 1;
    const co2 = avg(fuelRows.map(r => num(r.co2_uitstoot_gecombineerd)).filter(n => n > 0));
    const kw = avg(fuelRows.map(r => num(r.nettomaximumvermogen)).filter(n => n > 0));
    const verbruik = avg(fuelRows.map(r => num(r.brandstofverbruik_gecombineerd)).filter(n => n > 0));

    const jaarItems = perJaar.error ? [] : perJaar.filter(r => r.jaar).map(r => ({ x: r.jaar, n: num(r.n), hl: self && +r.jaar === self.bouwjaar }));
    const kleurItems = perKleur.error ? count('eerste_kleur') : perKleur.filter(r => r.eerste_kleur).map(r => ({ name: r.eerste_kleur, n: num(r.n), hl: self && r.eerste_kleur === self.v.eerste_kleur }));
    const label = [f.merk, f.model].filter(Boolean).join(' ').toUpperCase() + (f.van || f.tot ? ` (${f.van || '…'}–${f.tot || '…'})` : '') + (f.tgk || f.type ? ', zelfde generatie' : '');

    return { f, self, groep: f.groep || describeFilter(f), sample, total, totalAll, prijs, massa, apkVerlopen, export_, terugroep, onlogisch, count,
      gebrekTop, omschr, others, gPer, kPer, totG, totK, modelGpk, zonderGebreken, metKeuring,
      fuelCount, fuelRows, co2, kw, verbruik, jaarItems, kleurItems, label };
  }

  async function runModelAnalysis(out, f, self) {
    out.innerHTML = U.loading('Model analyseren…');
    const st = await computeModelStats(f, self);
    if (st.error) { out.innerHTML = U.errorBox(st.error); return; }
    if (st.empty) { out.innerHTML = '<section class="card"><p class="muted">Geen voertuigen gevonden voor deze zoekopdracht. Merk en model moeten exact overeenkomen met de RDW-schrijfwijze (bijv. "VOLKSWAGEN" en "GOLF").</p></section>'; return; }
    const { sample, total, totalAll, prijs, massa, apkVerlopen, export_, terugroep, onlogisch, count,
      gebrekTop, omschr, others, gPer, kPer, totG, totK, modelGpk, zonderGebreken, metKeuring,
      fuelCount, fuelRows, co2, kw, verbruik, jaarItems, kleurItems, label } = st;
    let compare = '';
    if (self) {
      const sKw = self.kw, sCo2 = self.co2;
      const row = (name, mine, theirs, fmt, lowerBetter) => {
        let cls = '';
        if (lowerBetter != null && mine != null && theirs != null && mine !== theirs) cls = (lowerBetter ? mine < theirs : mine > theirs) ? 'best' : 'worse';
        const diff = mine != null && theirs ? ((mine - theirs) / theirs * 100) : null;
        return `<tr><td>${name}</td><td class="num ${cls}">${mine != null ? fmt(mine) : '–'}</td><td class="num">${theirs != null ? fmt(theirs) : '–'}</td>
          <td class="num muted">${diff != null && isFinite(diff) ? (diff > 0 ? '+' : '') + diff.toFixed(0) + '%' : ''}</td></tr>`;
      };
      compare = `<section class="card"><h2>Deze auto vs. gemiddelde ${esc(label)}</h2>
        <div class="table-wrap"><table class="data compare"><thead><tr><th></th><th class="num">${esc(RDW.formatKenteken(self.kenteken))}</th><th class="num">Gemiddeld</th><th class="num">Verschil</th></tr></thead><tbody>
        ${row('Mankementen per APK', self.gebrekenPerKeuring, modelGpk, x => fmtNum(x, 2), true)}
        ${row('Aantal APK-keuringen', kPer[self.kenteken] ?? self.history.length, metKeuring ? totK / metKeuring : null, x => fmtNum(x, 1), null)}
        ${row('Catalogusprijs', num(self.v.catalogusprijs), prijs, fmtEuro, null)}
        ${row('Vermogen (kW)', sKw, kw, x => fmtNum(x), false)}
        ${row('CO₂ (g/km)', sCo2, co2, x => fmtNum(x), true)}
        ${row('Verbruik (l/100km)', self.verbruik, verbruik, x => fmtNum(x, 1), true)}
        ${row('Massa rijklaar (kg)', num(self.v.massa_rijklaar), massa, x => fmtNum(x), null)}
        </tbody></table></div>
        <p class="small muted">Vergeleken met: ${esc([f.merk, f.model].join(' '))}, ${esc(f.groep || describeFilter(f))} (${fmtNum(total)} auto's). APK-gegevens uit een steekproef van ${others.length} kentekens.</p></section>`;
    }

    out.innerHTML = `
      <div class="stats bento">
        ${U.stat('Op kenteken', fmtNum(total), totalAll && totalAll !== total ? `${fmtNum(totalAll)} van dit model in totaal` : esc(label))}
        ${U.stat('Gem. catalogusprijs', fmtEuro(prijs))}
        ${U.stat('Mankementen per APK', modelGpk != null ? fmtNum(modelGpk, 1) : '', 'gemiddeld per keuring')}
        ${U.stat('Altijd zonder mankementen', metKeuring ? Math.round(zonderGebreken / metKeuring * 100) + '%' : '', 'van de auto\'s')}
        ${U.stat('APK verlopen', apkVerlopen.toFixed(1) + '%', 'in steekproef')}
        ${U.stat('Open terugroepactie', terugroep.toFixed(1) + '%')}
        ${U.stat('Geëxporteerd', export_.toFixed(1) + '%')}
        ${U.stat('Kilometerstand onlogisch', onlogisch.toFixed(1) + '%')}
      </div>
      ${compare}
      <div class="grid-2">
        <section class="card"><h2>Wat vindt de APK het vaakst bij dit model?</h2><p class="sub">Bij ${esc(label)}, steekproef van ${others.length} auto's</p>
          ${gebrekTop.error ? U.errorBox(gebrekTop.error) : U.bars(gebrekTop.map(g => ({ name: (omschr[g.gebrek_identificatie] || {}).gebrek_omschrijving || g.gebrek_identificatie, n: num(g.n) })))}</section>
        <section class="card"><h2>Registraties per bouwjaar</h2><p class="sub">${esc([f.merk, f.model].filter(Boolean).join(' ').toUpperCase())}, alle jaren</p>${U.columns(jaarItems)}</section>
        <section class="card"><h2>Kleuren</h2>${U.bars(kleurItems, { pct: true, total })}</section>
        <section class="card"><h2>Brandstof</h2>${U.bars(Object.entries(fuelCount).map(([name, n]) => ({ name, n, hl: self && self.brandstof.includes(name) })).sort((a, b) => b.n - a.n), { pct: true })}</section>
        <section class="card"><h2>Uitvoering / inrichting</h2>${U.bars(count('inrichting'), { pct: true, total: sample.length })}</section>
        <section class="card"><h2>Motorvermogen</h2><p class="sub">Hoe sterk zijn de motoren van dit model?</p>${U.bars(U.pkItems(fuelRows, self && self.pk), { pct: true })}</section>
      </div>
      <section class="card"><h2>Vergelijkbare auto's</h2><p class="sub">Klik op een kenteken om die auto te bekijken.</p>
        ${U.table(sample.slice(0, 40).map(r => ({ ...r, gebreken: gPer[r.kenteken] ?? '', keuringen: kPer[r.kenteken] ?? '' })),
          { keys: ['kenteken', 'handelsbenaming', 'datum_eerste_toelating', 'eerste_kleur', 'inrichting', 'catalogusprijs', 'vervaldatum_apk', 'keuringen', 'gebreken'] })}
      </section>`;
  }

  /* ---------- Kentekens naast elkaar vergelijken ---------- */

  async function comparePage(el, list) {
    list = (list || []).map(RDW.normalizeKenteken).filter(Boolean).slice(0, 4);
    const inputs = [0, 1, 2, 3].map(i => `<div class="plate-input small"><span class="nl">NL</span><input name="k${i}" value="${esc(list[i] ? RDW.formatKenteken(list[i]) : '')}" placeholder="AB-12-CD" maxlength="10" autocomplete="off"></div>`).join('');
    el.innerHTML = `<section class="card"><h2>Auto's vergelijken</h2><p class="sub">Twijfel je tussen een paar auto's? Typ tot vier kentekens en zie welke het beste scoort.</p>
      <form id="cmpForm" class="form-row">${inputs}<button class="btn">Vergelijk</button></form></section><div id="cmpOut"></div>`;
    el.querySelector('#cmpForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const ks = [...new FormData(ev.target).values()].map(RDW.normalizeKenteken).filter(Boolean);
      location.hash = '#/vergelijk/' + ks.join(',');
    });
    if (!list.length) return;
    const out = el.querySelector('#cmpOut');
    out.innerHTML = U.loading('Auto\'s ophalen en rapporten opstellen…');
    const all = await Promise.all(list.map(k => RDW.fetchAllForKenteken(k).then(async d => { if (!d.voertuig.rows.length) return { kenteken: k, missing: true }; const c = summarize(d); c.rapport = await Report.compute(c, d); return c; }).catch(e => ({ kenteken: k, missing: true, error: e.message }))));
    const cars = all.filter(c => !c.missing);
    const missing = all.filter(c => c.missing);
    if (!cars.length) { out.innerHTML = U.errorBox('Geen van de kentekens gevonden.'); return; }

    // [label, waarde-functie, opmaak, richting: 1 = hoger beter, -1 = lager beter, 0 = neutraal]
    const rows = [
      ['Rapportcijfer', c => c.rapport ? c.rapport.total : null, (x, c) => `<span class="score-inline ${c.rapport.verdict.cls}">${Report.scoreText(x)}</span> ${esc(c.rapport.verdict.label)}`, 1],
      ['Merk & model', c => c.titel, esc, 0],
      ['Bouwjaar', c => c.bouwjaar, String, 1],
      ['Brandstof', c => c.brandstof, esc, 0],
      ['Kleur', c => c.v.eerste_kleur, esc, 0],
      ['Inrichting', c => c.v.inrichting, esc, 0],
      ['Vermogen (pk)', c => c.pk, x => fmtNum(x), 1],
      ['Cilinderinhoud (cc)', c => num(c.v.cilinderinhoud), x => fmtNum(x), 0],
      ['Gewicht (kg)', c => num(c.v.massa_rijklaar), x => fmtNum(x), -1],
      ['Trekgewicht geremd (kg)', c => num(c.v.maximum_trekken_massa_geremd), x => fmtNum(x), 1],
      ['Catalogusprijs', c => num(c.v.catalogusprijs), fmtEuro, 0],
      ['CO₂ (g/km)', c => c.co2, x => fmtNum(x), -1],
      ['Verbruik (l/100km)', c => c.verbruik, x => fmtNum(x, 1), -1],
      ['Actieradius EV (km)', c => c.bereik, x => fmtNum(x), 1],
      ['Euroklasse', c => c.euroklasse, esc, 0],
      ['Energielabel', c => c.v.zuinigheidsclassificatie, esc, 0],
      ['APK geldig t/m', c => c.apk ? c.apk.getTime() : null, x => fmtDate(new Date(x)), 1],
      ['APK-keuringen', c => c.history.length, x => fmtNum(x), 0],
      ['Mankementen bij APK', c => c.totaalGebreken, x => fmtNum(x), 0],
      ['Mankementen per APK', c => c.gebrekenPerKeuring, x => fmtNum(x, 2), -1],
      ['Open terugroepacties', c => c.terugroepOpen, x => fmtNum(x), -1],
      ['Kilometerstand (NAP)', c => c.v.tellerstandoordeel, esc, 0],
      ['Op naam sinds', c => c.eigenaarSinds ? c.eigenaarSinds.getTime() : null, x => fmtDate(new Date(x)), 0],
      ['Verzekerd', c => c.v.wam_verzekerd, esc, 0],
    ];
    const body = rows.map(([label, get, fmt, dir]) => {
      const vals = cars.map(get);
      const nums = vals.filter(v => typeof v === 'number');
      const best = dir && nums.length > 1 ? (dir > 0 ? Math.max(...nums) : Math.min(...nums)) : null;
      const allSame = nums.length > 1 && nums.every(n => n === nums[0]);
      return `<tr><td>${esc(label)}</td>${vals.map((v, i) => `<td class="${best != null && v === best && !allSame ? 'best' : ''}">${v == null || v === '' ? '–' : fmt(v, cars[i])}</td>`).join('')}</tr>`;
    }).join('');
    out.innerHTML = `${missing.length ? `<div class="notice">Niet gevonden: ${missing.map(m => esc(RDW.formatKenteken(m.kenteken))).join(', ')}</div><br>` : ''}
      <section class="card"><div class="table-wrap"><table class="data compare">
        <thead><tr><th></th>${cars.map(c => `<th><a href="#/k/${esc(c.kenteken)}"><span class="plate-badge">${esc(RDW.formatKenteken(c.kenteken))}</span></a></th>`).join('')}</tr></thead>
        <tbody>${body}</tbody></table></div>
        <p class="small muted">Groen = beste waarde. Begin bij het rapportcijfer bovenaan.</p></section>`;
  }

  /* ---------- Datasets / vrije query ---------- */

  function datasetsPage(el, params) {
    const opts = Object.entries(RDW.DATASETS).map(([key, d]) =>
      `<option value="${key}" ${params.ds === key ? 'selected' : ''}>${esc(d.titel)} (${d.id})</option>`).join('');
    el.innerHTML = `<section class="card"><h2>RDW Open Data verkennen</h2>
      <p class="sub">Bevraag elke dataset rechtstreeks met <a href="https://dev.socrata.com/docs/queries/" target="_blank" rel="noopener">SoQL</a>, bijvoorbeeld <code>merk='TESLA' AND datum_eerste_toelating_dt&gt;'2024-01-01'</code>.</p>
      <form id="dsForm" class="form-row">
        <label class="field">Dataset<select name="ds">${opts}</select></label>
        <label class="field" style="flex:1;min-width:220px">$where<input name="where" value="${esc(params.where || '')}" placeholder="kenteken='12ABC3'"></label>
        <label class="field">$order<input name="order" value="${esc(params.order || '')}"></label>
        <label class="field">$limit<input name="limit" type="number" value="${esc(params.limit || 50)}" min="1" max="50000"></label>
        <button class="btn">Uitvoeren</button>
      </form></section>
      <div id="dsOut"></div>
      <section class="card"><h2>Gebruikte datasets</h2>${U.table(Object.entries(RDW.DATASETS).map(([key, d]) => ({ dataset: d.titel, id: d.id, sleutel: key })))}</section>`;
    el.querySelector('#dsForm').addEventListener('submit', ev => {
      ev.preventDefault();
      location.hash = '#/datasets?' + new URLSearchParams(Object.fromEntries(new FormData(ev.target))).toString();
    });
    if (!params.ds) return;
    const out = el.querySelector('#dsOut');
    out.innerHTML = U.loading();
    const p = { $where: params.where, $order: params.order, $limit: params.limit || 50 };
    RDW.query(params.ds, p).then(rows => {
      out.innerHTML = `<section class="card"><h2>${fmtNum(rows.length)} resultaten</h2>
        <p class="sub"><a href="${esc(RDW.url(RDW.DATASETS[params.ds].id, p))}" target="_blank" rel="noopener">API-URL openen</a></p>${U.table(rows)}</section>`;
    }).catch(e => { out.innerHTML = U.errorBox(e.message); });
  }

  /* ---------- Zoekbalk ---------- */

  function searchHero(k) {
    const recent = U.getRecent();
    return `<section class="search-hero${k ? ' compact' : ''}">
      ${k ? '' : `<span class="eyebrow">Gratis · officiële RDW-gegevens</span><h1>Is het een goede auto?</h1>
        <p>Typ het kenteken en krijg direct een rapportcijfer, alle APK-keuringen en tips voor als je hem wilt kopen.</p>`}
      <form class="plate-form" id="plateForm">
        <div class="plate-input"><span class="nl"><span class="stars">★</span>NL</span>
          <input id="plate" name="kenteken" placeholder="XX-123-X" maxlength="10" autocomplete="off" spellcheck="false" value="${esc(k ? RDW.formatKenteken(k) : '')}" aria-label="Kenteken"></div>
        <button class="btn btn-lg">Check</button>
      </form>
      ${!k && recent.length ? `<div class="recent"><span class="muted small">Recent:</span>${recent.map(r =>
        `<a class="chip" href="#/k/${esc(r.kenteken)}"><b>${esc(RDW.formatKenteken(r.kenteken))}</b> ${esc(r.titel || '')}</a>`).join('')}</div>` : ''}
    </section>`;
  }

  function bindSearch(el) {
    const form = el.querySelector('#plateForm');
    const input = el.querySelector('#plate');
    input.addEventListener('blur', () => { if (input.value) input.value = RDW.formatKenteken(input.value); });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const k = RDW.normalizeKenteken(input.value);
      if (k) location.hash = '#/k/' + k;
    });
  }

  function homePage(el) {
    el.innerHTML = searchHero('') + `
      <div class="features">
        <a class="feature" href="#/"><b>Rapportcijfer</b><span>Eén cijfer van 1 tot 10, met in gewone taal wat goed is en waar je op moet letten.</span></a>
        <a class="feature" href="#/model"><b>APK-geschiedenis</b><span>Elke keuring sinds 2018 en wat er gerepareerd moest worden. Beter of slechter dan andere auto's van hetzelfde type?</span></a>
        <a class="feature" href="#/vergelijk"><b>Auto's vergelijken</b><span>Twijfel je tussen een paar auto's? Zet ze naast elkaar en zie welke het beste scoort.</span></a>
        <a class="feature" href="#/vraag"><b>Vraag het</b><span>"Meest voorkomende mankementen van een Citroën C3 2010-2017": typ je vraag en krijg direct grafieken.</span></a>
      </div>`;
    bindSearch(el);
    el.querySelector('#plate').focus();
  }

  window.Views = { generations, homePage, kentekenPage, comparePage, modelAnalysis, datasetsPage, summarize, computeModelStats, resolvePeerFilter, describeFilter, tgkBase, gebrekMap };
})();
