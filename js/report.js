/* Rapport: eindcijfer (1-10) met uitleg in gewone taal.
 * Het cijfer is een indicatie op basis van openbare RDW-gegevens. */
(function () {
  'use strict';
  const { esc, num, fmtNum, fmtDate, daysBetween, parseDate } = U;

  // Gebreken in gewone-taal-categorieën (op trefwoord in de RDW-omschrijving).
  const CATEGORIES = [
    ['Banden', /band|profiel|velg|wiel(?!ophang)/i],
    ['Remmen', /rem/i],
    ['Verlichting', /licht|lamp|reflector|knipper/i],
    ['Ruiten & wissers', /ruit|wisser|sproei|zicht/i],
    ['Sturing & vering', /stuur|fusee|ophanging|schokbreker|veer|kogel|spoorstang|draagarm|stabilisator/i],
    ['Roest & carrosserie', /corrosie|roest|carrosserie|bodem|chassis|spatbord|bumper/i],
    ['Uitlaat & uitstoot', /uitlaat|emissie|roet|katalysator|co[- ]?gehalte|uitstoot|geluid/i],
    ['Lekkage', /lek|olie|vloeistof/i],
    ['Gordels & airbags', /gordel|airbag/i],
    ['Spiegels', /spiegel/i],
    ['Kenteken & papieren', /kenteken|identificatie|chassisnummer|registratie/i],
  ];
  function categorize(text) {
    for (const [name, re] of CATEGORIES) if (re.test(text || '')) return name;
    return 'Overig';
  }

  // "VOLKSWAGEN GOLF" -> "Volkswagen Golf" (korte afkortingen als BMW blijven hoofdletters)
  function niceName(v) {
    return [v.merk, v.handelsbenaming].filter(Boolean).join(' ').toLowerCase()
      .replace(/(^|[\s-])([a-z\u00e0-\u00ff])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(Bmw|Vw|Mg|Ds|Byd|Gt|Gti|Suv|Ev)\b/g, w => w.toUpperCase());
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const round1 = (x) => Math.round(x * 10) / 10;

  function verdict(score) {
    if (score >= 8.5) return { label: 'Uitstekend', cls: 'ok' };
    if (score >= 7) return { label: 'Goed', cls: 'ok' };
    if (score >= 5.5) return { label: 'Redelijk', cls: 'warn' };
    if (score >= 4) return { label: 'Matig', cls: 'warn' };
    return { label: 'Slecht', cls: 'bad' };
  }

  function defectGroups(s, data) {
    const omschr = Views.gebrekMap(data.gebrekOmschrijving.rows);
    const groups = {};
    for (const e of s.history) {
      for (const g of e.gebreken) {
        const cat = categorize((omschr[g.gebrek_identificatie] || {}).gebrek_omschrijving);
        const n = num(g.aantal_gebreken_geconstateerd) || 1;
        groups[cat] = groups[cat] || { name: cat, n: 0, keer: new Set() };
        groups[cat].n += n;
        groups[cat].keer.add(e.key);
      }
    }
    return Object.values(groups).map(g => ({ name: g.name, n: g.n, keuringen: g.keer.size })).sort((a, b) => b.n - a.n);
  }

  function score(s, data, st) {
    const v = s.v;
    const now = new Date();
    const points = [];  // {type: 'good'|'warn'|'bad', text}
    const tips = [];
    const cats = [];
    const model = niceName(v);
    const ageY = s.toelating ? (now - s.toelating) / (365.25 * 86400000) : null;
    const groups = defectGroups(s, data);

    // 1. APK-geschiedenis
    {
      let sc, why;
      const keuringen = s.history.length;
      const last = s.history[0];
      if (!keuringen) {
        if (ageY != null && ageY < 4) { sc = 8.5; why = 'Nog geen APK nodig, de auto is jonger dan 4 jaar.'; }
        else { sc = 6; why = 'Er zijn geen keuringen gevonden in de openbare gegevens.'; }
      } else {
        const gpk = s.gebrekenPerKeuring || 0;
        sc = 10 - gpk * 3;
        const ratio = st && st.modelGpk ? gpk / st.modelGpk : null;
        if (ratio != null && ratio < 0.7) sc += 1;
        if (ratio != null && ratio > 1.5) sc -= 1;
        why = gpk === 0 ? `Bij alle ${keuringen} keuringen geen mankementen gevonden.`
          : `Gemiddeld ${fmtNum(gpk, 1)} mankement${gpk >= 1.05 ? 'en' : ''} per keuring` + (st && st.modelGpk != null ? ` (vergelijkbare auto's: ${fmtNum(st.modelGpk, 1)}).` : '.');
        if (gpk === 0) points.push({ type: 'good', text: `Nooit mankementen gevonden bij de APK (${keuringen} keuringen).` });
        else if (ratio != null && ratio < 0.8) points.push({ type: 'good', text: `Minder mankementen bij de APK dan vergelijkbare ${model}s.` });
        else if (ratio != null && ratio > 1.3) points.push({ type: 'warn', text: `Meer mankementen bij de APK dan vergelijkbare ${model}s.` });
        if (last && last.aantalGebreken === 0) points.push({ type: 'good', text: `Laatste keuring (${fmtDate(last.date)}) zonder mankementen.` });
        if (last && last.aantalGebreken >= 3) { sc -= 1; points.push({ type: 'warn', text: `Bij de laatste keuring werden ${last.aantalGebreken} mankementen gevonden.` }); }
      }
      if (s.apk && s.apk < now) { sc = Math.min(sc, 2); points.push({ type: 'bad', text: `De APK is verlopen (sinds ${fmtDate(s.apk)}). Je mag er niet mee de weg op.` }); }
      else if (s.apk && daysBetween(now, s.apk) <= 90) { points.push({ type: 'warn', text: `De APK verloopt binnenkort (${fmtDate(s.apk)}).` }); tips.push('De APK verloopt binnenkort. Spreek af dat de verkoper de auto eerst laat keuren.'); }
      else if (s.apk) points.push({ type: 'good', text: `APK is geldig tot ${fmtDate(s.apk)}.` });
      cats.push({ naam: 'APK-keuringen', gewicht: 30, score: clamp(sc, 1, 10), why });
    }

    // 2. Kilometerstand
    {
      const o = v.tellerstandoordeel || '';
      let sc = 6, why = 'Er is geen oordeel over de kilometerstand bekend.';
      if (/onlogisch/i.test(o)) { sc = 2; why = 'De kilometerstand is onlogisch volgens de Nationale Auto Pas (NAP).'; points.push({ type: 'bad', text: 'Kilometerstand is onlogisch: er is mogelijk met de teller geknoeid.' }); tips.push('Vraag om het onderhoudsboekje en facturen om de kilometerstand te controleren.'); }
      else if (/logisch/i.test(o)) { sc = 10; why = 'De kilometerstand loopt logisch op volgens de NAP.'; points.push({ type: 'good', text: 'Kilometerstand klopt (NAP-logisch).' }); }
      cats.push({ naam: 'Kilometerstand', gewicht: 15, score: sc, why });
    }

    // 3. Veiligheid & papieren
    {
      let sc = 10;
      const issues = [];
      if (/nee/i.test(v.wam_verzekerd || '')) { sc -= 4; issues.push('niet verzekerd'); points.push({ type: 'warn', text: 'De auto is nu niet verzekerd (kan normaal zijn als hij te koop staat of geschorst is).' }); }
      if (s.terugroepOpen) { sc -= Math.min(5, 3 * s.terugroepOpen); issues.push('open terugroepactie'); points.push({ type: 'bad', text: `Er ${s.terugroepOpen > 1 ? 'staan ' + s.terugroepOpen + ' terugroepacties' : 'staat een terugroepactie'} open.` }); tips.push('Er staat een terugroepactie open: de dealer lost dit gratis op. Vraag of het al gedaan is.'); }
      else if (/ja/i.test(v.openstaande_terugroepactie_indicator || '')) { sc -= 3; issues.push('open terugroepactie'); points.push({ type: 'bad', text: 'Er staat een terugroepactie open.' }); tips.push('Er staat een terugroepactie open: de dealer lost dit gratis op.'); }
      else points.push({ type: 'good', text: 'Geen openstaande terugroepacties.' });
      if (/ja/i.test(v.export_indicator || '')) { sc -= 6; issues.push('geëxporteerd'); points.push({ type: 'bad', text: 'De auto staat geregistreerd als geëxporteerd.' }); }
      if (/nee/i.test(v.tenaamstellen_mogelijk || '')) { sc -= 6; issues.push('overschrijven niet mogelijk'); points.push({ type: 'bad', text: 'De auto kan nu niet op een nieuwe naam gezet worden.' }); tips.push('Overschrijven kan nu niet. Koop de auto pas als dit is opgelost.'); }
      if (/ja/i.test(v.wacht_op_keuren || '')) { sc -= 3; issues.push('moet nog gekeurd worden'); points.push({ type: 'warn', text: 'De auto wacht nog op een keuring bij de RDW.' }); }
      if (/ja/i.test(v.taxi_indicator || '')) { sc -= 2; issues.push('(ex-)taxi'); points.push({ type: 'warn', text: 'Dit is een (voormalige) taxi: meestal veel kilometers gemaakt.' }); }
      cats.push({ naam: 'Papieren & veiligheid', gewicht: 20, score: clamp(sc, 1, 10), why: issues.length ? 'Let op: ' + issues.join(', ') + '.' : 'Alles in orde: verzekerd, geen terugroepacties, niet geëxporteerd.' });
    }

    // 4. Betrouwbaarheid van het model
    if (st && st.modelGpk != null) {
      const sc = clamp(10 - st.modelGpk * 5, 2, 10);
      const pct = st.metKeuring ? Math.round(st.zonderGebreken / st.metKeuring * 100) : null;
      cats.push({ naam: 'Betrouwbaarheid model', gewicht: 15, score: sc,
        why: `Vergelijkbare ${model}s hebben gemiddeld ${fmtNum(st.modelGpk, 1)} mankementen per keuring` + (pct != null ? `; ${pct}% kwam altijd zonder mankementen door de APK.` : '.') });
      if (sc >= 8) points.push({ type: 'good', text: `De ${model} is een betrouwbaar model bij de APK.` });
      else if (sc < 5) points.push({ type: 'warn', text: `De ${model} heeft vaker dan gemiddeld mankementen bij de APK.` });
    }

    // 5. Leeftijd & eigenaar
    if (ageY != null) {
      let sc = clamp(10 - ageY * 0.4, 2, 10);
      const own = s.eigenaarSinds ? (now - s.eigenaarSinds) / (365.25 * 86400000) : null;
      let why = `${Math.floor(ageY)} jaar oud.`;
      if (own != null && own >= 3) { sc += 0.5; why += ` Huidige eigenaar heeft hem al ${Math.floor(own)} jaar.`; points.push({ type: 'good', text: `Huidige eigenaar heeft de auto al ${Math.floor(own)} jaar.` }); }
      else if (own != null && own < 0.5) { sc -= 1; why += ' Recent van eigenaar gewisseld.'; points.push({ type: 'warn', text: `Pas sinds ${fmtDate(s.eigenaarSinds)} op naam van de huidige eigenaar.` }); }
      const nl = parseDate(v.datum_eerste_tenaamstelling_in_nederland_dt || v.datum_eerste_tenaamstelling_in_nederland);
      if (nl && s.toelating && (nl - s.toelating) > 365 * 86400000) points.push({ type: 'warn', text: `Geïmporteerd: pas sinds ${fmtDate(nl)} in Nederland. De geschiedenis van daarvoor is onbekend.` });
      cats.push({ naam: 'Leeftijd & eigenaar', gewicht: 10, score: clamp(sc, 1, 10), why });
    }

    // 6. Milieu & verbruik
    {
      const label = (v.zuinigheidsclassificatie || '').toUpperCase();
      const LBL = { 'A+++': 10, 'A++': 10, 'A+': 9.5, A: 9, B: 8, C: 7, D: 6, E: 5, F: 4, G: 3 };
      const elektrisch = /elektr/i.test(s.brandstof) && !/benzine|diesel/i.test(s.brandstof);
      let sc = null, why = '';
      if (elektrisch) { sc = 10; why = 'Volledig elektrisch: geen uitstoot.'; }
      else if (LBL[label]) { sc = LBL[label]; why = `Energielabel ${label}.`; }
      else if (s.co2) { sc = clamp(10 - (s.co2 - 90) / 20, 2, 10); why = `CO₂-uitstoot ${fmtNum(s.co2)} g/km.`; }
      const euro = parseInt(s.euroklasse, 10);
      if (/diesel/i.test(s.brandstof) && euro && euro <= 3) {
        sc = Math.min(sc ?? 5, 3);
        points.push({ type: 'bad', text: `Oude diesel (Euro ${euro}): niet welkom in milieuzones van diverse steden.` });
      }
      if (sc != null) cats.push({ naam: 'Milieu & verbruik', gewicht: 10, score: sc, why: why + (s.verbruik ? ` Verbruik ±${fmtNum(s.verbruik, 1)} l/100 km (1 op ${fmtNum(100 / s.verbruik)}).` : '') });
    }

    // Terugkerende mankementen → tips
    const tipFor = {
      Banden: 'Banden waren vaker afgekeurd. Bekijk het profiel goed of vraag om nieuwe banden.',
      Remmen: 'De remmen hadden vaker mankementen. Laat ze controleren bij een proefrit.',
      'Roest & carrosserie': 'Er werd vaker roest gevonden. Kijk onder de auto en bij de wielkasten.',
      'Sturing & vering': 'Sturing/vering had vaker mankementen. Let op tikken of trekken tijdens de proefrit.',
      Lekkage: 'Er werd vaker lekkage gevonden. Kijk onder de motor naar olievlekken.',
      'Uitlaat & uitstoot': 'De uitlaat/uitstoot was vaker een probleem. Luister naar de uitlaat en let op rook.',
    };
    for (const g of groups) if (g.keuringen >= 2 && tipFor[g.name]) tips.push(tipFor[g.name]);
    if (!tips.length) tips.push('Maak altijd een proefrit en laat bij twijfel een aankoopkeuring doen.');

    const totW = cats.reduce((a, c) => a + c.gewicht, 0);
    const total = round1(cats.reduce((a, c) => a + c.score * c.gewicht, 0) / totW);
    return { total, verdict: verdict(total), cats: cats.map(c => ({ ...c, score: round1(c.score) })), points, tips, groups, st };
  }

  function compute(s, data) {
    if (!s._report) {
      s._report = Views.computeModelStats(Views.defaultModelFilter(s), s)
        .catch(() => null)
        .then(st => score(s, data, st && !st.error && !st.empty ? st : null));
    }
    return s._report;
  }

  function scoreText(x) { return x.toFixed(1).replace('.', ','); }

  function ring(r, size) {
    const pct = r.total / 10;
    const R = 52, C = 2 * Math.PI * R;
    return `<svg class="ring ${r.verdict.cls}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Rapportcijfer ${scoreText(r.total)} van 10">
      <circle cx="60" cy="60" r="${R}" class="track"/>
      <circle cx="60" cy="60" r="${R}" class="val" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="66" text-anchor="middle" class="num">${scoreText(r.total)}</text>
      <text x="60" y="86" text-anchor="middle" class="of">van 10</text>
    </svg>`;
  }

  function pill(r) {
    return `<a class="score-pill ${r.verdict.cls}" href="#" onclick="document.querySelector('[data-tab=rapport]').click();return false;" title="Rapportcijfer">
      <b>${scoreText(r.total)}</b><span>${esc(r.verdict.label)}</span></a>`;
  }

  function summaryLine(s, r) {
    const model = niceName(s.v);
    const bad = r.points.filter(p => p.type === 'bad').length;
    const warn = r.points.filter(p => p.type === 'warn').length;
    const base = `Deze ${esc(model)}${s.bouwjaar ? ' uit ' + s.bouwjaar : ''}`;
    if (bad) return `${base} heeft ${bad === 1 ? 'een belangrijk aandachtspunt' : bad + ' belangrijke aandachtspunten'}. Lees ze hieronder goed door.`;
    if (r.total >= 8) return `${base} ziet er goed uit: weinig mankementen en geen openstaande problemen.`;
    if (warn) return `${base} is in orde, maar let op ${warn === 1 ? 'één punt' : warn + ' punten'}.`;
    return `${base} is in orde volgens de openbare gegevens.`;
  }

  const ICON = { good: '✓', warn: '!', bad: '✕' };

  async function renderTab(el, s, data) {
    el.innerHTML = U.loading('Rapport opstellen en vergelijken met andere auto\'s van dit type…');
    const r = await compute(s, data);
    if (!el.isConnected) return;
    const model = niceName(s.v);
    const order = { bad: 0, warn: 1, good: 2 };
    const points = [...r.points].sort((a, b) => order[a.type] - order[b.type]);
    const st = r.st;
    const cmp = (mine, avg, lowerBetter, fmt) => {
      if (mine == null || avg == null) return '';
      const better = lowerBetter ? mine < avg * 0.9 : mine > avg * 1.1;
      const worse = lowerBetter ? mine > avg * 1.1 : mine < avg * 0.9;
      return `<div class="vs-row"><div class="vs-mine">${fmt(mine)}</div><div class="vs-avg">gemiddeld ${fmt(avg)}</div>
        <span class="badge ${better ? 'ok' : worse ? 'warn' : ''}">${better ? 'beter' : worse ? 'slechter' : 'gemiddeld'}</span></div>`;
    };

    el.innerHTML = `
      <section class="card report-hero">
        ${ring(r, 168)}
        <div class="report-hero-text">
          <span class="eyebrow-plain">Rapportcijfer</span>
          <h2 class="verdict ${r.verdict.cls}">${esc(r.verdict.label)}</h2>
          <p class="lead">${summaryLine(s, r)}</p>
          <div class="report-actions">
            <button class="btn" onclick="window.print()">Print / opslaan als PDF</button>
            <a class="btn ghost" href="#/vergelijk/${esc(s.kenteken)}">Vergelijk met andere auto</a>
          </div>
        </div>
      </section>

      <div class="grid-2">
        <section class="card"><h2>Belangrijkste punten</h2>
          <ul class="points">${points.map(p => `<li class="${p.type}"><span class="ic">${ICON[p.type]}</span>${p.text}</li>`).join('')}</ul>
        </section>
        <section class="card"><h2>Tips voor als je hem wilt kopen</h2>
          <ul class="tips">${r.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </section>
      </div>

      <section class="card"><h2>Zo is het cijfer berekend</h2>
        <div class="cats">${r.cats.map(c => `
          <div class="cat">
            <div class="cat-head"><b>${esc(c.naam)}</b><span class="cat-score ${verdict(c.score).cls}">${scoreText(c.score)}</span></div>
            <div class="bar-track"><div class="bar-fill ${verdict(c.score).cls}" style="width:${c.score * 10}%"></div></div>
            <p>${esc(c.why)}</p>
          </div>`).join('')}
        </div>
      </section>

      <div class="grid-2">
        <section class="card"><h2>Wat vond de APK?</h2>
          ${r.groups.length ? `<p class="sub">Alle mankementen sinds ${s.history.length ? s.history[s.history.length - 1].date.getFullYear() : ''}, per onderdeel.</p>
            ${U.bars(r.groups.map(g => ({ name: g.name, n: g.n })))}
            <p class="small"><a href="#" data-goto="apk">Bekijk elke keuring →</a></p>`
            : '<p class="muted">Geen mankementen gevonden bij de APK. 👍</p>'}
        </section>
        <section class="card"><h2>Vergeleken met andere ${esc(model)}s</h2>
          ${st ? `<p class="sub">Uit dezelfde jaren (${esc(st.f.van)}–${esc(st.f.tot)}). Er rijden er ${fmtNum(st.total)} van in Nederland.</p>
            <div class="vs">
              <div class="vs-label">Mankementen per APK</div>${cmp(s.gebrekenPerKeuring, st.modelGpk, true, x => fmtNum(x, 1)) || '<div class="muted">onbekend</div>'}
              <div class="vs-label">Nieuwprijs</div>${cmp(num(s.v.catalogusprijs), st.prijs, null, U.fmtEuro) || '<div class="muted">onbekend</div>'}
              <div class="vs-label">CO₂-uitstoot</div>${cmp(s.co2, st.co2, true, x => fmtNum(x) + ' g/km') || '<div class="muted">onbekend</div>'}
            </div>
            <p class="small"><a href="#" data-goto="vergelijk">Uitgebreide vergelijking →</a></p>`
            : '<p class="muted">Vergelijking met andere auto\'s niet beschikbaar.</p>'}
        </section>
      </div>
      <p class="small muted disclaimer">Dit cijfer is een indicatie op basis van openbare RDW-gegevens. Het vervangt geen aankoopkeuring. Eigenaren en kilometerstanden per keuring zijn niet openbaar.</p>`;
    el.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault(); const b = document.querySelector(`.subtabs [data-tab="${a.dataset.goto}"]`); if (b) b.click();
    }));
  }

  window.Report = { compute, renderTab, pill, categorize, scoreText };
})();
