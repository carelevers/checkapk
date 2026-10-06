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
    ['overzicht', 'Overzicht'], ['apk', 'APK-historie'], ['terugroep', 'Terugroepacties'],
    ['milieu', 'Milieu & brandstof'], ['techniek', 'Techniek'], ['vergelijk', 'Zelfde type'], ['data', 'Alle data'],
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
      history.replaceState(null, '', '#/k/' + k + (t && t !== 'overzicht' ? '/' + t : ''));
      body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in');
      ({
        overzicht: () => { body.innerHTML = overviewTab(s, data); },
        apk: () => { body.innerHTML = apkTab(s, data); },
        terugroep: () => { body.innerHTML = recallTab(data); },
        milieu: () => { body.innerHTML = fuelTab(data); },
        techniek: () => { body.innerHTML = techTab(data); },
        vergelijk: () => { modelAnalysis(body, defaultModelFilter(s), s); },
        data: () => { body.innerHTML = rawTab(data, k); },
      }[t] || (() => {}))();
      body.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); show(a.dataset.goto); }));
    };
    res.querySelectorAll('.subtabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
    show(SUBTABS.some(([id]) => id === tab) ? tab : 'overzicht');
  }

  function vehicleHeader(s) {
    const v = s.v;
    const meta = [v.voertuigsoort, v.inrichting, v.eerste_kleur && v.eerste_kleur !== 'N.v.t.' ? v.eerste_kleur : null,
      s.bouwjaar, s.brandstof].filter(Boolean).map(esc).join(' · ');
    return `<section class="card hero-card">
      <div class="vehicle-head">
        <span class="plate-badge big"><i>NL</i>${esc(RDW.formatKenteken(s.kenteken))}</span>
        <div><h1>${esc(s.titel || 'Onbekend voertuig')}</h1><div class="meta">${meta}</div></div>
        <a class="btn ghost" href="#/vergelijk/${esc(s.kenteken)}">+ Vergelijk</a>
      </div>
      <div class="badges">
        ${apkBadge(s)}
        ${yesNoBadge(v.wam_verzekerd, 'WAM verzekerd', 'ja')}
        ${s.terugroepTotaal ? `<span class="badge ${s.terugroepOpen ? 'bad' : 'ok'}">Terugroepacties: ${s.terugroepTotaal}${s.terugroepOpen ? ` (${s.terugroepOpen} open)` : ''}</span>`
          : yesNoBadge(v.openstaande_terugroepactie_indicator, 'Open terugroepactie', 'nee')}
        ${v.tellerstandoordeel ? `<span class="badge ${/logisch/i.test(v.tellerstandoordeel) && !/onlogisch/i.test(v.tellerstandoordeel) ? 'ok' : 'warn'}">Tellerstand: ${esc(v.tellerstandoordeel)}</span>` : ''}
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
        ${U.stat('Massa rijklaar', v.massa_rijklaar ? fmtNum(v.massa_rijklaar) + ' kg' : '', v.cilinderinhoud ? fmtNum(v.cilinderinhoud) + ' cc' : '')}
        ${U.stat('Op naam sinds', s.eigenaarSinds ? fmtDate(s.eigenaarSinds) : '', s.eigenaarSinds ? esc(ageText(s.eigenaarSinds)) : '')}
        ${U.stat('APK-meldingen', fmtNum(s.history.length), last ? 'laatste ' + fmtDate(last.date) : '')}
        ${U.stat('Gebreken totaal', fmtNum(s.totaalGebreken), s.gebrekenPerKeuring != null ? fmtNum(s.gebrekenPerKeuring, 2) + ' per keuring' : '')}
        ${U.stat('CO₂', s.co2 != null ? fmtNum(s.co2) + ' g/km' : '', s.euroklasse ? 'Euro ' + esc(s.euroklasse) : '')}
      </div>
      <div class="grid-2">
        <section class="card"><h2>Voertuig</h2>${U.kv(v, ['merk', 'handelsbenaming', 'voertuigsoort', 'inrichting', 'eerste_kleur', 'tweede_kleur',
          'aantal_zitplaatsen', 'aantal_deuren', 'datum_eerste_toelating', 'datum_eerste_tenaamstelling_in_nederland', 'datum_tenaamstelling',
          'vervaldatum_apk', 'zuinigheidsclassificatie', 'catalogusprijs', 'bruto_bpm'])}</section>
        <section class="card"><h2>Laatste APK-meldingen</h2>${apkTimeline(s.history.slice(0, 4), data)}
          ${s.history.length > 4 ? `<p><a href="#" data-goto="apk">Volledige historie (${s.history.length}) →</a></p>` : ''}</section>
      </div>`;
  }

  /* ---------- APK-historie ---------- */

  function apkTimeline(history, data) {
    if (!history.length) return '<p class="muted">Geen APK-meldingen gevonden in de open data.</p>';
    const omschr = gebrekMap(data.gebrekOmschrijving.rows);
    return '<ul class="timeline">' + history.map(e => {
      const k = e.keuringen[0] || {};
      const soort = k.soort_melding_ki_omschrijving || k.soort_erkenning_omschrijving || (e.keuringen.length ? 'Keuring' : 'Gebreken geconstateerd');
      const verval = k.vervaldatum_keuring_dt || k.vervaldatum_keuring;
      const tijd = k.meld_tijd_door_keuringsinstantie ? String(k.meld_tijd_door_keuringsinstantie).padStart(4, '0').replace(/(\d{2})(\d{2})$/, '$1:$2') : '';
      const cls = e.aantalGebreken === 0 ? '' : e.aantalGebreken >= 4 ? 'bad' : 'warn';
      const defects = e.gebreken.map(g => {
        const o = omschr[g.gebrek_identificatie] || {};
        const n = num(g.aantal_gebreken_geconstateerd) || 1;
        return `<li>${n > 1 ? `<b>${n}×</b> ` : ''}${esc(o.gebrek_omschrijving || 'Gebrek')} <code>${esc(g.gebrek_identificatie)}</code></li>`;
      }).join('');
      return `<li><span class="dot ${cls}"></span>
        <div class="when">${fmtDate(e.date)}${tijd ? ` <span class="muted small">${esc(tijd)}</span>` : ''}</div>
        <div class="what">${esc(soort)}${verval ? ' · nieuwe vervaldatum ' + fmtDate(verval) : ''}
          · ${e.aantalGebreken ? `<b>${e.aantalGebreken} gebrek${e.aantalGebreken > 1 ? 'en' : ''}</b>` : 'geen gebreken gemeld'}</div>
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
        ${U.stat('APK-vervaldatum', s.apk ? fmtDate(s.apk) : '', s.apk ? (daysBetween(new Date(), s.apk) >= 0 ? 'nog ' + daysBetween(new Date(), s.apk) + ' dagen' : 'verlopen') : '')}
        ${U.stat('Meldingen', fmtNum(s.history.length))}
        ${U.stat('Met gebreken', fmtNum(metGebreken), s.history.length ? Math.round(metGebreken / s.history.length * 100) + '% van de meldingen' : '')}
        ${U.stat('Gebreken totaal', fmtNum(s.totaalGebreken), s.gebrekenPerKeuring != null ? fmtNum(s.gebrekenPerKeuring, 2) + ' per keuring' : '')}
        ${U.stat('Tellerstand', esc(s.v.tellerstandoordeel || ''), s.v.jaar_laatste_registratie_tellerstand ? 'laatst geregistreerd ' + esc(s.v.jaar_laatste_registratie_tellerstand) : '')}
      </div>
      <div class="grid-2">
        <section class="card"><h2>Gebreken per jaar</h2>${U.columns(yearItems)}</section>
        <section class="card"><h2>Meest voorkomende gebreken</h2>${U.bars(topGebreken)}</section>
      </div>
      <section class="card"><h2>Tijdlijn</h2>
        <p class="sub">Meldingen van keuringsinstanties gecombineerd met de geconstateerde gebreken per datum.</p>
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

  function defaultModelFilter(s) {
    return {
      merk: s.v.merk || '', model: s.v.handelsbenaming || '',
      van: s.bouwjaar ? s.bouwjaar - 1 : '', tot: s.bouwjaar ? s.bouwjaar + 1 : '',
    };
  }

  function modelWhere(f, withYears) {
    const parts = [];
    if (f.merk) parts.push('merk=' + RDW.lit(f.merk.toUpperCase()));
    if (f.model) parts.push('handelsbenaming=' + RDW.lit(f.model.toUpperCase()));
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
        <label class="field">Merk<input name="merk" value="${esc(f.merk)}" placeholder="bijv. VOLKSWAGEN" required></label>
        <label class="field">Model<input name="model" value="${esc(f.model)}" placeholder="bijv. GOLF"></label>
        <label class="field">Bouwjaar van<input name="van" type="number" min="1900" max="2100" value="${esc(f.van)}"></label>
        <label class="field">tot<input name="tot" type="number" min="1900" max="2100" value="${esc(f.tot)}"></label>
        <button class="btn">Analyseer</button>
      </form></section><div id="modelOut"></div>`;
    const form = el.querySelector('#modelForm');
    const out = el.querySelector('#modelOut');
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const nf = Object.fromEntries(new FormData(form));
      if (!self) location.hash = '#/model?' + new URLSearchParams(nf).toString();
      else runModelAnalysis(out, nf, self);
    });
    if (f.merk) runModelAnalysis(out, f, self);
  }

  async function safe(p) { try { return await p; } catch (e) { return { error: e.message }; } }

  async function runModelAnalysis(out, f, self) {
    out.innerHTML = U.loading('Model analyseren…');
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
    if (sample.error) { out.innerHTML = U.errorBox('Ophalen mislukt: ' + sample.error); return; }
    if (!sample.length) { out.innerHTML = '<section class="card"><p class="muted">Geen voertuigen gevonden voor deze zoekopdracht. Merk en model moeten exact overeenkomen met de RDW-schrijfwijze (bijv. "VOLKSWAGEN" en "GOLF").</p></section>'; return; }

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
    const label = [f.merk, f.model].filter(Boolean).join(' ').toUpperCase() + (f.van || f.tot ? ` (${f.van || '…'}–${f.tot || '…'})` : '');

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
        ${row('Gebreken per keuring', self.gebrekenPerKeuring, modelGpk, x => fmtNum(x, 2), true)}
        ${row('Aantal keuringsmeldingen', kPer[self.kenteken] ?? self.history.length, metKeuring ? totK / metKeuring : null, x => fmtNum(x, 1), null)}
        ${row('Catalogusprijs', num(self.v.catalogusprijs), prijs, fmtEuro, null)}
        ${row('Vermogen (kW)', sKw, kw, x => fmtNum(x), false)}
        ${row('CO₂ (g/km)', sCo2, co2, x => fmtNum(x), true)}
        ${row('Verbruik (l/100km)', self.verbruik, verbruik, x => fmtNum(x, 1), true)}
        ${row('Massa rijklaar (kg)', num(self.v.massa_rijklaar), massa, x => fmtNum(x), null)}
        </tbody></table></div>
        <p class="small muted">Gemiddelden over voertuigen van hetzelfde merk/model en bouwjaar ${esc(f.van)}–${esc(f.tot)}. APK-gegevens uit een steekproef van ${others.length} kentekens.</p></section>`;
    }

    out.innerHTML = `
      <div class="stats bento">
        ${U.stat('Op kenteken', fmtNum(total), totalAll && totalAll !== total ? `${fmtNum(totalAll)} van dit model in totaal` : esc(label))}
        ${U.stat('Gem. catalogusprijs', fmtEuro(prijs))}
        ${U.stat('Gebreken per keuring', modelGpk != null ? fmtNum(modelGpk, 2) : '', `${fmtNum(totG)} gebreken / ${fmtNum(totK)} keuringen`)}
        ${U.stat('Foutloos door APK', metKeuring ? Math.round(zonderGebreken / metKeuring * 100) + '%' : '', 'auto\'s zonder geregistreerde gebreken')}
        ${U.stat('APK verlopen', apkVerlopen.toFixed(1) + '%', 'in steekproef')}
        ${U.stat('Open terugroepactie', terugroep.toFixed(1) + '%')}
        ${U.stat('Geëxporteerd', export_.toFixed(1) + '%')}
        ${U.stat('Tellerstand onlogisch', onlogisch.toFixed(1) + '%')}
      </div>
      ${compare}
      <div class="grid-2">
        <section class="card"><h2>Meest voorkomende APK-gebreken</h2><p class="sub">Bij ${esc(label)}, steekproef van ${others.length} auto's</p>
          ${gebrekTop.error ? U.errorBox(gebrekTop.error) : U.bars(gebrekTop.map(g => ({ name: (omschr[g.gebrek_identificatie] || {}).gebrek_omschrijving || g.gebrek_identificatie, n: num(g.n) })))}</section>
        <section class="card"><h2>Registraties per bouwjaar</h2><p class="sub">${esc([f.merk, f.model].filter(Boolean).join(' ').toUpperCase())}, alle jaren</p>${U.columns(jaarItems)}</section>
        <section class="card"><h2>Kleuren</h2>${U.bars(kleurItems, { pct: true, total })}</section>
        <section class="card"><h2>Brandstof</h2>${U.bars(Object.entries(fuelCount).map(([name, n]) => ({ name, n, hl: self && self.brandstof.includes(name) })).sort((a, b) => b.n - a.n), { pct: true })}</section>
        <section class="card"><h2>Uitvoering / inrichting</h2>${U.bars(count('inrichting'), { pct: true, total: sample.length })}</section>
        <section class="card"><h2>Varianten (typegoedkeuring)</h2>${U.bars(count('uitvoering').map(i => ({ ...i, hl: self && i.name === self.v.uitvoering })), { pct: true, total: sample.length })}</section>
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
    el.innerHTML = `<section class="card"><h2>Kentekens vergelijken</h2><p class="sub">Zet tot vier auto's naast elkaar: specificaties, APK-gebreken, terugroepacties en meer.</p>
      <form id="cmpForm" class="form-row">${inputs}<button class="btn">Vergelijk</button></form></section><div id="cmpOut"></div>`;
    el.querySelector('#cmpForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const ks = [...new FormData(ev.target).values()].map(RDW.normalizeKenteken).filter(Boolean);
      location.hash = '#/vergelijk/' + ks.join(',');
    });
    if (!list.length) return;
    const out = el.querySelector('#cmpOut');
    out.innerHTML = U.loading('Gegevens ophalen…');
    const all = await Promise.all(list.map(k => RDW.fetchAllForKenteken(k).then(d => d.voertuig.rows.length ? summarize(d) : { kenteken: k, missing: true }).catch(e => ({ kenteken: k, missing: true, error: e.message }))));
    const cars = all.filter(c => !c.missing);
    const missing = all.filter(c => c.missing);
    if (!cars.length) { out.innerHTML = U.errorBox('Geen van de kentekens gevonden.'); return; }

    // [label, waarde-functie, opmaak, richting: 1 = hoger beter, -1 = lager beter, 0 = neutraal]
    const rows = [
      ['Merk & model', c => c.titel, esc, 0],
      ['Bouwjaar', c => c.bouwjaar, String, 1],
      ['Brandstof', c => c.brandstof, esc, 0],
      ['Kleur', c => c.v.eerste_kleur, esc, 0],
      ['Inrichting', c => c.v.inrichting, esc, 0],
      ['Vermogen (pk)', c => c.pk, x => fmtNum(x), 1],
      ['Cilinderinhoud (cc)', c => num(c.v.cilinderinhoud), x => fmtNum(x), 0],
      ['Massa rijklaar (kg)', c => num(c.v.massa_rijklaar), x => fmtNum(x), -1],
      ['Trekgewicht geremd (kg)', c => num(c.v.maximum_trekken_massa_geremd), x => fmtNum(x), 1],
      ['Catalogusprijs', c => num(c.v.catalogusprijs), fmtEuro, 0],
      ['CO₂ (g/km)', c => c.co2, x => fmtNum(x), -1],
      ['Verbruik (l/100km)', c => c.verbruik, x => fmtNum(x, 1), -1],
      ['Actieradius EV (km)', c => c.bereik, x => fmtNum(x), 1],
      ['Euroklasse', c => c.euroklasse, esc, 0],
      ['Energielabel', c => c.v.zuinigheidsclassificatie, esc, 0],
      ['APK geldig t/m', c => c.apk ? c.apk.getTime() : null, x => fmtDate(new Date(x)), 1],
      ['APK-meldingen', c => c.history.length, x => fmtNum(x), 0],
      ['Gebreken totaal', c => c.totaalGebreken, x => fmtNum(x), -1],
      ['Gebreken per keuring', c => c.gebrekenPerKeuring, x => fmtNum(x, 2), -1],
      ['Terugroepacties (open)', c => c.terugroepTotaal, (x, c) => `${fmtNum(x)}${c.terugroepOpen ? ` (${c.terugroepOpen})` : ''}`, -1],
      ['Tellerstandoordeel', c => c.v.tellerstandoordeel, esc, 0],
      ['Op naam sinds', c => c.eigenaarSinds ? c.eigenaarSinds.getTime() : null, x => fmtDate(new Date(x)), 0],
      ['WAM verzekerd', c => c.v.wam_verzekerd, esc, 0],
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
        <p class="small muted">Groen = beste waarde in de vergelijking.</p></section>`;
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
      ${k ? '' : `<span class="eyebrow">RDW Open Data · live</span><h1>Alles over elk Nederlands kenteken</h1>
        <p>Voertuiggegevens, volledige APK-historie met gebreken, terugroepacties en een vergelijking met hetzelfde type auto.</p>`}
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
        <a class="feature" href="#/"><b>APK-historie</b><span>Elke keuring met datum, nieuwe vervaldatum en alle geconstateerde gebreken.</span></a>
        <a class="feature" href="#/model"><b>Zelfde type vergelijken</b><span>Hoe scoort deze auto t.o.v. hetzelfde model en bouwjaar? Gebreken, prijs, CO₂.</span></a>
        <a class="feature" href="#/vergelijk"><b>Naast elkaar</b><span>Zet tot vier kentekens naast elkaar en zie direct wie wint.</span></a>
        <a class="feature" href="#/datasets"><b>Alle RDW-data</b><span>Terugroepacties, assen, carrosserie, brandstof — en een vrije query-tool.</span></a>
      </div>`;
    bindSearch(el);
    el.querySelector('#plate').focus();
  }

  window.Views = { homePage, kentekenPage, comparePage, modelAnalysis, datasetsPage, summarize };
})();
