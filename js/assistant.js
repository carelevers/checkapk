/* "Vraag het": vragen in gewone taal → grafieken uit RDW Open Data.
 * Laag 1: eigen vraag-herkenning (werkt altijd, zonder AI).
 * Laag 2 (optioneel): lokale AI via Ollama die de vraag vertaalt en de uitkomst samenvat.
 * Alle cijfers komen altijd uit de RDW-data, nooit van de AI. */
(function () {
  'use strict';
  const { esc, num, fmtNum, fmtEuro, parseDate } = U;
  const AI = Object.assign({ enabled: true, url: 'http://localhost:11434', model: 'gpt-oss:20b', keepAlive: '30m', numCtx: 8192 }, window.CHECKAPK_AI || {});
  // gpt-oss redeneert eerst: 'low' is sneller, 'high' grondiger. Standaard 'medium'.
  const THINK = AI.think !== undefined ? AI.think : (/^gpt-oss/.test(AI.model) ? 'medium' : undefined);

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const has = (text, key) => (' ' + text + ' ').includes(' ' + key + ' ');
  const nice = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Bmw|Vw|Mg|Ds|Byd|Gti|Suv)\b/g, w => w.toUpperCase());

  const MERK_ALIAS = {
    vw: 'VOLKSWAGEN', volkswagen: 'VOLKSWAGEN', mercedes: 'MERCEDES-BENZ', merc: 'MERCEDES-BENZ', benz: 'MERCEDES-BENZ',
    'mercedes benz': 'MERCEDES-BENZ', alfa: 'ALFA ROMEO', 'land rover': 'LAND ROVER', landrover: 'LAND ROVER',
    chevy: 'CHEVROLET', citroen: 'CITROEN', skoda: 'SKODA', 'rolls royce': 'ROLLS ROYCE',
  };
  const STOP = new Set(['en', 'van', 'de', 'het', 'een', 'met', 'voor', 'na', 'tot', 'per', 'apk', 'auto', 'autos', 'model', 'nvt', 'n v t', 'onbekend']);

  /* ---------- Index van merken en modellen (één query, daarna in cache) ---------- */

  let indexP = null;
  function modelIndex() {
    if (!indexP) {
      indexP = RDW.query('voertuig', {
        $select: 'merk, handelsbenaming, count(*) as n', $group: 'merk, handelsbenaming',
        $having: 'count(*) >= 100', $order: 'n DESC', $limit: 50000,
      }).then(rows => {
        const merken = {}, models = {};
        for (const r of rows) {
          if (!r.merk) continue;
          const n = num(r.n) || 0;
          const mk = norm(r.merk);
          merken[mk] = merken[mk] || { merk: r.merk, n: 0 };
          merken[mk].n += n;
          if (!r.handelsbenaming) continue;
          let key = norm(r.handelsbenaming);
          if (key.startsWith(mk + ' ')) key = key.slice(mk.length + 1);   // "PEUGEOT 208" → "208"
          if (!key) continue;
          const id = r.merk + '|' + key;
          models[id] = models[id] || { merk: r.merk, key, variants: [], n: 0 };
          models[id].variants.push(r.handelsbenaming);
          models[id].n += n;
        }
        return { merken: Object.values(merken), models: Object.values(models) };
      }).catch(e => { indexP = null; throw e; });
    }
    return indexP;
  }

  async function merkModels(merk) {
    const idx = await modelIndex();
    return idx.models.filter(m => m.merk === merk);
  }

  function findMerk(idx, text) {
    for (const [alias, merk] of Object.entries(MERK_ALIAS).sort((a, b) => b[0].length - a[0].length)) {
      if (has(text, alias) && idx.merken.some(m => m.merk === merk)) return { merk, key: alias };
    }
    const hits = idx.merken.filter(m => { const k = norm(m.merk); return k.length >= 2 && !STOP.has(k) && has(text, k); })
      .sort((a, b) => norm(b.merk).length - norm(a.merk).length || b.n - a.n);
    return hits.length ? { merk: hits[0].merk, key: norm(hits[0].merk) } : null;
  }

  /* ---------- Laag 1: vraag herkennen ---------- */

  const TOPICS = [
    ['mankementen', /mankement|gebrek|afkeur|\bapk\b|defect|probleem|problemen|kapot|zwakke|betrouwba|storing/],
    ['kleuren', /kleur/],
    ['brandstof', /brandstof|diesel|benzine|elektri|hybride|\blpg\b/],
    ['aantallen', /aantal|hoeveel|registr|per jaar|verkocht|rijden er|op de weg/],
    ['prijs', /prijs|kost|nieuwprijs|catalogus|duur/],
    ['vermogen', /\bpk\b|vermogen|\bkw\b|sterk|motor/],
    ['milieu', /co2|verbruik|zuinig|uitstoot|milieu/],
    ['terugroepacties', /terugroep|recall/],
    ['generaties', /generatie|uitvoering|versies/],
  ];
  const TOPIC_LABEL = {
    mankementen: 'Mankementen', kleuren: 'Kleuren', brandstof: 'Brandstof', aantallen: 'Aantallen per bouwjaar',
    prijs: 'Nieuwprijs', vermogen: 'Vermogen', milieu: 'CO₂ & verbruik', terugroepacties: 'Terugroepacties',
    generaties: 'Generaties', topmodellen: 'Populairste modellen', topmerken: 'Populairste merken',
  };

  function parseYears(text) {
    const Y = '((?:19[5-9]|20[0-4])\\d)';
    let m = text.match(new RegExp(`\\b${Y}\\s+(?:(?:tot en met|t m|tm|tot|en|to|t)\\s+)?${Y}\\b`));
    if (m) return { van: Math.min(+m[1], +m[2]), tot: Math.max(+m[1], +m[2]) };
    m = text.match(new RegExp(`\\b(vanaf|sinds|na|nieuwer dan)\\s+${Y}\\b`));
    if (m) return { van: +m[2] + (m[1] === 'na' || m[1] === 'nieuwer dan' ? 1 : 0), tot: null };
    m = text.match(new RegExp(`\\b(voor|ouder dan|tot en met|tot|t m)\\s+${Y}\\b`));
    if (m) return { van: null, tot: +m[2] - (m[1] === 'voor' || m[1] === 'ouder dan' ? 1 : 0) };
    m = text.match(new RegExp(`\\b${Y}\\b`));
    if (m) return { van: +m[1], tot: +m[1] };
    return { van: null, tot: null };
  }

  async function ruleParse(question) {
    const idx = await modelIndex();
    let text = norm(question);
    const subjects = [];
    const consume = (key) => { text = (' ' + text + ' ').replace(' ' + key + ' ', ' § ').trim(); };

    // Merken + modellen (langste naam eerst, zodat "c3 picasso" voor "c3" gaat)
    for (let guard = 0; guard < 4; guard++) {
      const mk = findMerk(idx, text);
      if (!mk) break;
      consume(mk.key);
      const models = (await merkModels(mk.merk)).filter(m => m.key.length >= 1 && has(text, m.key))
        .sort((a, b) => b.key.length - a.key.length || b.n - a.n);
      if (!models.length) { subjects.push({ merk: mk.merk }); continue; }
      for (const m of models) if (has(text, m.key)) { consume(m.key); subjects.push(m); }
    }
    // Model zonder merk ("golf 2015"): alleen bekende, niet te korte namen
    if (!subjects.length) {
      const cands = idx.models.filter(m => m.key.length >= 3 && /[a-z]/.test(m.key) && !STOP.has(m.key) && has(text, m.key))
        .sort((a, b) => b.key.length - a.key.length || b.n - a.n);
      const seen = new Set();
      for (const m of cands) {
        if (seen.has(m.key) || !has(text, m.key)) continue;
        seen.add(m.key); consume(m.key); subjects.push(m);
      }
    }

    // Volgorde zoals in de vraag ("yaris en polo" → Yaris eerst)
    const full = ' ' + norm(question) + ' ';
    const pos = (s) => { const i = full.indexOf(' ' + (s.key || norm(s.merk)) + ' '); return i < 0 ? 1e9 : i; };
    subjects.sort((a, b) => pos(a) - pos(b));

    const years = parseYears(text);
    const topics = TOPICS.filter(([, re]) => re.test(text)).map(([t]) => t);
    if (/merk/.test(text) && !subjects.length) topics.push('topmerken');
    if (/model|populair|meest verkocht|welke/.test(text) && subjects.length && subjects.every(s => !s.key)) topics.push('topmodellen');
    if (/populair|meest verkocht/.test(text) && !subjects.length && !topics.includes('topmerken')) topics.push('topmerken');
    return { subjects, ...years, topics: [...new Set(topics)] };
  }

  /* ---------- Laag 2: lokale AI (Ollama) ---------- */

  let aiStatus = null;
  function checkAI() {
    if (!AI.enabled) return Promise.resolve({ ok: false, reason: 'uitgeschakeld' });
    if (!aiStatus) {
      aiStatus = (async () => {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 2000);
          const res = await fetch(AI.url + '/api/tags', { signal: ctl.signal });
          clearTimeout(t);
          const j = await res.json();
          const names = (j.models || []).map(m => m.name);
          const found = names.some(n => n === AI.model || n.split(':')[0] === AI.model.split(':')[0] && AI.model.indexOf(':') < 0);
          return found ? { ok: true } : { ok: false, reason: `model "${AI.model}" niet geïnstalleerd`, names };
        } catch (e) {
          return { ok: false, reason: 'Ollama niet bereikbaar' };
        }
      })();
    }
    return aiStatus;
  }

  const aiOptions = () => ({ temperature: 0, num_ctx: AI.numCtx });

  /* Model alvast in het geheugen laden, zodat de eerste vraag niet op het laden wacht. */
  let warmP = null;
  function warmUp() {
    if (!warmP) {
      warmP = fetch(AI.url + '/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: AI.model, keep_alive: AI.keepAlive, options: aiOptions() }),
      }).then(r => r.ok).catch(() => false);
    }
    return warmP;
  }

  /* Chat met Ollama. Met onToken wordt het antwoord gestreamd (woord voor woord). */
  async function ollama(messages, format, timeoutMs, onToken) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs || 120000);
    try {
      const body = { model: AI.model, stream: !!onToken, messages, format, keep_alive: AI.keepAlive, options: aiOptions() };
      if (THINK !== undefined) body.think = THINK;
      const res = await fetch(AI.url + '/api/chat', {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('AI gaf ' + res.status);
      if (!onToken) {
        const j = await res.json();
        return (j.message && j.message.content) || '';
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const j = JSON.parse(line);
          const m = j.message || {};
          if (m.content) { text += m.content; onToken(text, false); }
          else if (m.thinking) onToken(text, true);
        }
      }
      return text;
    } finally { clearTimeout(t); }
  }

  const PLAN_SCHEMA = {
    type: 'object',
    properties: {
      autos: { type: 'array', items: { type: 'object', properties: { merk: { type: 'string' }, model: { type: 'string' } }, required: ['merk', 'model'] } },
      bouwjaar_van: { type: 'integer' },
      bouwjaar_tot: { type: 'integer' },
      onderwerpen: { type: 'array', items: { type: 'string', enum: Object.keys(TOPIC_LABEL) } },
    },
    required: ['autos', 'bouwjaar_van', 'bouwjaar_tot', 'onderwerpen'],
  };

  async function aiParse(question) {
    const system = `Je zet vragen over Nederlandse auto's om naar JSON voor een zoekopdracht in het RDW-kentekenregister.
- autos: lijst van {merk, model}. Merk zoals het RDW het schrijft (bijv. VOLKSWAGEN, CITROEN, MERCEDES-BENZ). Model zonder merk (bijv. GOLF, C3, MODEL 3). Laat model leeg ("") als alleen een merk genoemd wordt. Lege lijst als er geen auto genoemd wordt.
- bouwjaar_van / bouwjaar_tot: jaartallen, 0 als niet genoemd.
- onderwerpen: kies uit ${Object.keys(TOPIC_LABEL).join(', ')}. "mankementen" = APK-gebreken/problemen/betrouwbaarheid.
Antwoord alleen met JSON.`;
    const content = await ollama([{ role: 'system', content: system }, { role: 'user', content: question }], PLAN_SCHEMA, 90000);
    const m = content.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : content);
  }

  async function resolveAiPlan(plan) {
    const idx = await modelIndex();
    const subjects = [];
    for (const a of plan.autos || []) {
      const mk = findMerk(idx, norm(a.merk)) || findMerk(idx, norm(a.merk + ' ' + a.model));
      if (!mk) continue;
      const key = norm(a.model).replace(new RegExp('^' + norm(mk.merk) + ' '), '');
      if (!key) { subjects.push({ merk: mk.merk }); continue; }
      const models = await merkModels(mk.merk);
      const hit = models.find(m => m.key === key) || models.filter(m => m.key.startsWith(key + ' ') || key.startsWith(m.key + ' ')).sort((x, y) => y.n - x.n)[0];
      if (hit) subjects.push(hit);
    }
    const y = (v) => (v && v > 1900 && v < 2100 ? v : null);
    return { subjects, van: y(plan.bouwjaar_van), tot: y(plan.bouwjaar_tot), topics: (plan.onderwerpen || []).filter(t => TOPIC_LABEL[t]) };
  }

  async function understand(question, useAi) {
    const rule = await ruleParse(question);
    // Snel pad: als de vraag al volledig herkend is, niet op de (trage) lokale AI wachten.
    const complete = (rule.subjects.length && rule.topics.length) || rule.topics.includes('topmerken');
    if (!useAi || complete) return { ...rule, via: 'zoekbalk' };
    try {
      const ai = await resolveAiPlan(await aiParse(question));
      return {
        subjects: ai.subjects.length ? ai.subjects : rule.subjects,
        van: ai.van ?? rule.van, tot: ai.tot ?? rule.tot,
        topics: ai.topics.length ? ai.topics : rule.topics,
        via: 'AI',
      };
    } catch (e) {
      return { ...rule, via: 'zoekbalk', aiError: e.message };
    }
  }

  /* ---------- Uitvoeren ---------- */

  const label = (s) => s.key ? nice(s.merk) + ' ' + nice(s.variants[0].toUpperCase().replace(s.merk + ' ', '')) : nice(s.merk);

  function whereFor(s, p, extra) {
    const parts = ['merk=' + RDW.lit(s.merk)];
    if (s.variants) parts.push('handelsbenaming in' + RDW.inList(s.variants));
    if (p.van) parts.push(`datum_eerste_toelating_dt>='${p.van}-01-01T00:00:00'`);
    if (p.tot) parts.push(`datum_eerste_toelating_dt<='${p.tot}-12-31T23:59:59'`);
    if (extra) parts.push(extra);
    return parts.join(' AND ');
  }

  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  async function sampleFor(s, p, size) {
    const rows = await RDW.query('voertuig', {
      $select: 'kenteken, datum_eerste_toelating, datum_eerste_toelating_dt, catalogusprijs', $where: whereFor(s, p), $limit: size || 1000,
    });
    return rows;
  }

  async function perKenteken(key, kentekens, params) {
    const parts = await Promise.all(chunk(kentekens, 300).map(ks =>
      RDW.query(key, { ...params, $where: 'kenteken in' + RDW.inList(ks) + (params.$where ? ' AND ' + params.$where : ''), $limit: 50000 })));
    return parts.flat();
  }

  async function defectsFor(s, p) {
    const sample = (await sampleFor(s, p, 600)).map(r => r.kenteken);
    if (!sample.length) return null;
    const [gebreken, keuringen] = await Promise.all([
      perKenteken('gebreken', sample, { $select: 'gebrek_identificatie, count(*) as n', $group: 'gebrek_identificatie' }),
      perKenteken('keuringen', sample, { $select: 'count(*) as n' }),
    ]);
    const per = {};
    for (const g of gebreken) per[g.gebrek_identificatie] = (per[g.gebrek_identificatie] || 0) + (num(g.n) || 0);
    const totG = Object.values(per).reduce((a, b) => a + b, 0);
    const totK = keuringen.reduce((a, r) => a + (num(r.n) || 0), 0);
    const ids = Object.keys(per);
    const omschr = ids.length ? Views.gebrekMap(await RDW.query('gebrekOmschrijving', { $where: 'gebrek_identificatie in' + RDW.inList(ids.slice(0, 900)), $limit: 5000 })) : {};
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([id, n]) => ({ name: (omschr[id] || {}).gebrek_omschrijving || id, n }));
    const cats = {};
    for (const [id, n] of Object.entries(per)) { const c = Report.categorize((omschr[id] || {}).gebrek_omschrijving); cats[c] = (cats[c] || 0) + n; }
    return { n: sample.length, totG, totK, gpk: totK ? totG / totK : null, top, cats: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })) };
  }

  function recallText(r) {
    const keys = Object.keys(r).filter(k => /omschrijving|defect|gevolg|titel|probleem/i.test(k));
    return keys.map(k => r[k]).find(v => v && String(v).length > 8) || r.referentiecode_rdw;
  }

  const sec = (title, sub, html, csv) => ({ title, sub, html, csv });
  const csvBars = (head, items) => [head, ...items.map(i => [i.name, i.n])];

  async function runTopic(t, s, p) {
    const L = s ? label(s) : '';
    const jr = p.van || p.tot ? ` (${p.van || '…'}–${p.tot || '…'})` : '';
    switch (t) {
      case 'mankementen': {
        const d = await defectsFor(s, p);
        if (!d) return sec(`Mankementen ${L}${jr}`, '', '<p class="muted">Geen auto\'s gevonden.</p>');
        return [
          sec(`Meest gevonden mankementen bij ${L}${jr}`, `APK-keuringen van een steekproef van ${fmtNum(d.n)} auto's · gemiddeld ${d.gpk != null ? fmtNum(d.gpk, 2) : '?'} mankementen per keuring`,
            U.bars(d.top), csvBars(['mankement', 'aantal'], d.top)),
          sec(`Per onderdeel: ${L}${jr}`, 'Mankementen gegroepeerd', U.bars(d.cats, { pct: true }), csvBars(['onderdeel', 'aantal'], d.cats)),
        ];
      }
      case 'aantallen': {
        const rows = await RDW.query('voertuig', { $select: 'date_extract_y(datum_eerste_toelating_dt) as jaar, count(*) as n', $where: whereFor(s, p), $group: 'jaar', $order: 'jaar', $limit: 200 });
        const items = rows.filter(r => r.jaar).map(r => ({ x: r.jaar, n: num(r.n) }));
        const tot = items.reduce((a, i) => a + i.n, 0);
        return sec(`${L} op kenteken per bouwjaar${jr}`, `${fmtNum(tot)} auto's in totaal`, U.columns(items), [['bouwjaar', 'aantal'], ...items.map(i => [i.x, i.n])]);
      }
      case 'kleuren': {
        const rows = await RDW.query('voertuig', { $select: 'eerste_kleur, count(*) as n', $where: whereFor(s, p), $group: 'eerste_kleur', $order: 'n DESC', $limit: 15 });
        const items = rows.filter(r => r.eerste_kleur && r.eerste_kleur !== 'N.v.t.').map(r => ({ name: nice(r.eerste_kleur), n: num(r.n) }));
        return sec(`Kleuren ${L}${jr}`, '', U.bars(items, { pct: true }), csvBars(['kleur', 'aantal'], items));
      }
      case 'prijs': {
        const rows = await sampleFor(s, p, 3000);
        const by = {};
        for (const r of rows) { const d = parseDate(r.datum_eerste_toelating_dt || r.datum_eerste_toelating); const pr = num(r.catalogusprijs); if (d && pr > 0) { const y = d.getFullYear(); (by[y] = by[y] || []).push(pr); } }
        const items = Object.keys(by).sort().map(y => ({ x: y, n: Math.round(by[y].reduce((a, b) => a + b, 0) / by[y].length) }));
        return sec(`Gemiddelde nieuwprijs ${L} per bouwjaar${jr}`, `Catalogusprijs, steekproef van ${fmtNum(rows.length)} auto's`, U.columns(items), [['bouwjaar', 'gem. catalogusprijs'], ...items.map(i => [i.x, i.n])]);
      }
      case 'brandstof': case 'vermogen': case 'milieu': {
        const sample = await sampleFor(s, p, 1000);
        const fuel = await perKenteken('brandstof', sample.map(r => r.kenteken), {});
        if (t === 'vermogen') {
          const items = U.pkItems(fuel);
          return sec(`Motorvermogen ${L}${jr}`, `Steekproef van ${fmtNum(sample.length)} auto's`, U.bars(items, { pct: true }), csvBars(['vermogen', 'aantal'], items));
        }
        if (t === 'brandstof') {
          const c = {};
          for (const r of fuel) c[r.brandstof_omschrijving] = (c[r.brandstof_omschrijving] || 0) + 1;
          const items = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
          return sec(`Brandstof ${L}${jr}`, `Steekproef van ${fmtNum(sample.length)} auto's`, U.bars(items, { pct: true }), csvBars(['brandstof', 'aantal'], items));
        }
        const year = {};
        for (const r of sample) { const d = parseDate(r.datum_eerste_toelating_dt || r.datum_eerste_toelating); if (d) year[r.kenteken] = d.getFullYear(); }
        const by = {};
        for (const r of fuel) { const c = num(r.co2_uitstoot_gecombineerd); const y = year[r.kenteken]; if (c > 0 && y) (by[y] = by[y] || []).push(c); }
        const items = Object.keys(by).sort().map(y => ({ x: y, n: Math.round(by[y].reduce((a, b) => a + b, 0) / by[y].length) }));
        return sec(`Gemiddelde CO₂-uitstoot ${L} per bouwjaar${jr}`, 'Gram per kilometer (lager = zuiniger)', U.columns(items), [['bouwjaar', 'gem. co2 g/km'], ...items.map(i => [i.x, i.n])]);
      }
      case 'terugroepacties': {
        const sample = await sampleFor(s, p, 1000);
        const st = await perKenteken('terugroepStatus', sample.map(r => r.kenteken), {});
        const c = {};
        for (const r of st) c[r.referentiecode_rdw] = (c[r.referentiecode_rdw] || 0) + 1;
        const refs = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10);
        let det = {};
        if (refs.length) { try { det = Object.fromEntries((await RDW.query('terugroepActie', { $where: 'referentiecode_rdw in' + RDW.inList(refs.map(r => r[0])), $limit: 100 })).map(r => [r.referentiecode_rdw, r])); } catch (e) { /* alleen codes tonen */ } }
        const items = refs.map(([ref, n]) => ({ name: det[ref] ? recallText(det[ref]) : ref, n: n / sample.length * 100, ref }));
        return sec(`Terugroepacties ${L}${jr}`, `% van ${fmtNum(sample.length)} auto's dat erdoor geraakt werd`,
          items.length ? U.bars(items, { fmt: x => fmtNum(x, 1) + '%' }) : '<p class="muted">Geen terugroepacties gevonden in de steekproef.</p>',
          [['terugroepactie', 'referentie', '% auto\'s'], ...items.map(i => [i.name, i.ref, i.n.toFixed(1)])]);
      }
      case 'generaties': {
        const g = await Views.generations({ merk: s.merk, model: s.variants ? s.variants[0] : '' });
        const items = g.list.map(x => ({ name: `${x.van || '?'}–${x.tot || '?'}${x.types.length ? ' (type ' + x.types.join(', ') + ')' : ''}`, n: x.n }));
        return sec(`Generaties ${L}`, 'Jaren waarin 90% van elke generatie op kenteken kwam', U.bars(items), csvBars(['generatie', 'aantal'], items));
      }
      case 'topmodellen': {
        const rows = await RDW.query('voertuig', { $select: 'handelsbenaming, count(*) as n', $where: whereFor({ merk: s.merk }, p), $group: 'handelsbenaming', $order: 'n DESC', $limit: 15 });
        const items = rows.filter(r => r.handelsbenaming).map(r => ({ name: r.handelsbenaming, n: num(r.n) }));
        return sec(`Populairste modellen van ${nice(s.merk)}${jr}`, 'Aantal op kenteken', U.bars(items), csvBars(['model', 'aantal'], items));
      }
      case 'topmerken': {
        const parts = ["voertuigsoort='Personenauto'"];
        if (p.van) parts.push(`datum_eerste_toelating_dt>='${p.van}-01-01T00:00:00'`);
        if (p.tot) parts.push(`datum_eerste_toelating_dt<='${p.tot}-12-31T23:59:59'`);
        const rows = await RDW.query('voertuig', { $select: 'merk, count(*) as n', $where: parts.join(' AND '), $group: 'merk', $order: 'n DESC', $limit: 15 });
        const items = rows.map(r => ({ name: nice(r.merk), n: num(r.n) }));
        return sec(`Populairste automerken${jr}`, 'Personenauto\'s op kenteken', U.bars(items), csvBars(['merk', 'aantal'], items));
      }
    }
    return null;
  }

  function buildJobs(plan) {
    const subjects = plan.subjects.length ? plan.subjects : [null];
    let topics = plan.topics.length ? plan.topics : (plan.subjects.length ? (plan.subjects.every(s => !s.key) ? ['topmodellen', 'aantallen'] : ['aantallen', 'mankementen']) : []);
    const needsSubject = (t) => !['topmerken'].includes(t);
    const jobs = [];
    for (const t of topics) {
      if (!needsSubject(t)) { jobs.push(runTopic(t, null, plan)); continue; }
      for (const s of subjects) if (s) jobs.push(runTopic(t, s, plan));
    }
    // Vergelijking bij meerdere modellen
    if (plan.subjects.length > 1 && topics.includes('mankementen')) {
      jobs.push(Promise.all(plan.subjects.map(s => defectsFor(s, plan))).then(ds => {
        const items = plan.subjects.map((s, i) => ({ name: label(s), n: ds[i] && ds[i].gpk != null ? ds[i].gpk : 0 }));
        return sec('Vergelijking: mankementen per APK-keuring', 'Lager is beter', U.bars(items, { fmt: x => fmtNum(x, 2) }), [['model', 'mankementen per keuring'], ...items.map(i => [i.name, i.n.toFixed(3)])]);
      }));
    }
    return jobs.map(j => j.catch(e => sec('Mislukt', '', U.errorBox(e.message))));
  }

  /* Feiten voor de AI: nette namen, Nederlandse getallen en aandeel van het totaal. */
  function factsFor(sections) {
    const fmtV = (v) => (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) ? fmtNum(Number(v), Number(v) % 1 ? 2 : 0) : (/^[A-Z0-9 \-.]+$/.test(String(v)) && /[A-Z]{2}/.test(String(v)) ? nice(v) : String(v));
    return sections.filter(sc => sc.csv && sc.csv.length > 1).map(sc => {
      const [head, ...rows] = sc.csv;
      const share = head[1] === 'aantal';
      const total = share ? rows.reduce((a, r) => a + (Number(r[1]) || 0), 0) : 0;
      const lines = rows.slice(0, 12).map(r => '- ' + fmtV(r[0]) + ': ' + r.slice(1).map(fmtV).join(' / ') +
        (share && total ? ` (${Math.round(Number(r[1]) / total * 100)}%)` : ''));
      if (rows.length > 12) lines.push(`- … nog ${rows.length - 12} rijen`);
      return `${sc.title}${sc.sub ? ' (' + sc.sub + ')' : ''}\nKolommen: ${head.join(' / ')}${share ? ' (percentage = aandeel binnen deze getoonde rijen, niet van alle auto\'s)' : ''}\n${lines.join('\n')}`;
    }).join('\n\n');
  }

  const SUMMARY_SYSTEM = `Je bent een ervaren autokenner die een kort, nuttig antwoord schrijft voor een gewone autokoper.
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

  async function aiSummary(question, sections, onToken) {
    return ollama([
      { role: 'system', content: SUMMARY_SYSTEM },
      { role: 'user', content: `Vraag: ${question}\n\nGegevens uit het RDW-register:\n${factsFor(sections)}` },
    ], undefined, 300000, onToken);
  }

  /* ---------- Pagina ---------- */

  const EXAMPLES = [
    'Meest voorkomende mankementen van een Citroën C3 bouwjaar 2010-2017',
    'Vergelijk mankementen Toyota Yaris en Volkswagen Polo 2012-2016',
    'Hoeveel Tesla Model 3 per jaar',
    'Kleuren van de Volkswagen Golf vanaf 2020',
    'Terugroepacties Peugeot 208',
    'Populairste modellen van Kia',
    'Generaties van de Opel Corsa',
    'Populairste automerken 2023',
  ];

  function chips(plan) {
    const c = [];
    for (const s of plan.subjects) c.push(`<span class="q-chip">${esc(label(s))}</span>`);
    if (plan.van || plan.tot) c.push(`<span class="q-chip">Bouwjaar ${plan.van || '…'}–${plan.tot || '…'}</span>`);
    for (const t of plan.topics) c.push(`<span class="q-chip soft">${esc(TOPIC_LABEL[t] || t)}</span>`);
    return c.join('');
  }

  function downloadCsv(rows, name) {
    const csv = rows.map(r => r.map(v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function ask(el, question) {
    const list = el.querySelector('#answers');
    const card = document.createElement('section');
    card.className = 'card answer fade-in';
    card.innerHTML = `<div class="q-head"><h2>${esc(question)}</h2><button class="icon-btn" title="Verwijderen">✕</button></div><div class="q-body">${U.loading('Vraag begrijpen…')}</div>`;
    list.prepend(card);
    card.querySelector('.icon-btn').addEventListener('click', () => card.remove());
    const body = card.querySelector('.q-body');
    const t0 = performance.now();
    const ai = await checkAI();
    if (ai.ok) warmUp();
    let plan;
    try { plan = await understand(question, ai.ok); }
    catch (e) { body.innerHTML = U.errorBox('Kon de RDW-gegevens niet ophalen: ' + e.message); return; }

    if (!plan.subjects.length && !plan.topics.includes('topmerken')) {
      body.innerHTML = `<p>Ik weet niet zeker over welke auto je het hebt. Noem een merk en/of model, bijvoorbeeld:</p>
        <div class="examples">${EXAMPLES.slice(0, 3).map(x => `<button class="chip ex">${esc(x)}</button>`).join('')}</div>`;
      bindExamples(card, el);
      return;
    }
    const tPlan = performance.now();
    const jobs = buildJobs(plan);
    body.innerHTML = `<div class="q-chips"><span class="muted small">Begrepen via ${esc(plan.via)}:</span>${chips(plan)}</div>
      ${ai.ok ? '<div class="ai-summary"><span class="ai-label">AI-samenvatting (' + esc(AI.model) + ')</span><div class="ai-text">' + U.loading('Wacht op de RDW-gegevens…') + '</div></div>' : ''}
      <div class="answer-grid">${jobs.map((_, i) => `<div class="answer-sec pending" data-job="${i}">${U.loading('Gegevens ophalen uit het RDW-register…')}</div>`).join('')}</div>
      <p class="timing small muted"></p>`;
    const timing = body.querySelector('.timing');
    const sections = [];
    const secHtml = (sc, i) => `<div class="sec-head"><h3>${esc(sc.title)}</h3>${sc.csv ? `<button class="btn ghost btn-sm" data-csv="${i}">CSV</button>` : ''}</div>
      ${sc.sub ? `<p class="sub">${esc(sc.sub)}</p>` : ''}${sc.html}`;
    // Elke grafiek tonen zodra hij binnen is
    await Promise.all(jobs.map((job, ji) => job.then(r => {
      const list = (Array.isArray(r) ? r : [r]).filter(Boolean);
      const slot = body.querySelector(`[data-job="${ji}"]`);
      if (!slot) return;
      const els = list.map(sc => {
        const i = sections.push(sc) - 1;
        const d = document.createElement('div');
        d.className = 'answer-sec fade-in';
        d.innerHTML = secHtml(sc, i);
        d.querySelectorAll('[data-csv]').forEach(b => b.addEventListener('click', () => downloadCsv(sc.csv, sc.title)));
        return d;
      });
      slot.replaceWith(...els);
    })));
    const tData = performance.now();
    const fmtS = (ms) => fmtNum(ms / 1000, 1) + ' s';
    timing.textContent = `Vraag begrijpen: ${fmtS(tPlan - t0)} · RDW-gegevens: ${fmtS(tData - tPlan)}`;

    if (ai.ok) {
      const box = body.querySelector('.ai-text');
      box.innerHTML = U.loading('AI denkt na…');
      let first = null;
      aiSummary(question, sections, (text, thinking) => {
        if (thinking && !text) return;
        if (first == null) first = performance.now();
        box.textContent = text;
      }).then(t => {
        const tAi = performance.now();
        if (!t.trim()) box.textContent = 'Geen samenvatting.';
        timing.textContent += ` · AI: ${fmtS(tAi - tData)}` + (first ? ` (eerste woord na ${fmtS(first - tData)})` : '');
      }).catch(e => { box.textContent = 'Samenvatting mislukt: ' + e.message; });
    }
  }

  function bindExamples(root, el) {
    root.querySelectorAll('.ex').forEach(b => b.addEventListener('click', () => {
      el.querySelector('#q').value = b.textContent;
      el.querySelector('#askForm').requestSubmit();
    }));
  }

  async function page(el, params) {
    el.innerHTML = `<section class="ask-hero">
        <span class="eyebrow">Vraag het</span>
        <h1>Stel een vraag over elke auto</h1>
        <p>Typ wat je wilt weten, in gewone taal. De antwoorden en grafieken komen rechtstreeks uit het RDW-register.</p>
        <form id="askForm" class="ask-form">
          <input id="q" name="q" autocomplete="off" placeholder="Bijv. meest voorkomende mankementen van een Citroën C3 2010-2017" value="${esc(params.q || '')}">
          <button class="btn btn-lg">Vraag</button>
        </form>
        <div class="examples">${EXAMPLES.map(x => `<button type="button" class="chip ex">${esc(x)}</button>`).join('')}</div>
        <p class="ai-status small" id="aiStatus"></p>
      </section>
      <div id="answers"></div>`;
    bindExamples(el, el);
    const form = el.querySelector('#askForm');
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const q = el.querySelector('#q').value.trim();
      if (!q) return;
      window.history.replaceState(null, '', '#/vraag?q=' + encodeURIComponent(q));
      ask(el, q);
    });
    checkAI().then(st => {
      const s = el.querySelector('#aiStatus');
      if (!s) return;
      if (st.ok) {
        s.innerHTML = `<span class="dot-off"></span>Lokale AI <b>${esc(AI.model)}</b> wordt geladen…`;
        warmUp().then(ok => { s.innerHTML = ok ? `<span class="dot-on"></span>Lokale AI klaar: <b>${esc(AI.model)}</b>` : `<span class="dot-off"></span>Lokale AI <b>${esc(AI.model)}</b> kon niet laden.`; });
        return;
      }
      s.innerHTML = st.ok
        ? `<span class="dot-on"></span>Lokale AI actief: <b>${esc(AI.model)}</b>`
        : `<span class="dot-off"></span>Zonder AI (${esc(st.reason)}). Werkt prima; met een lokale AI begrijpt hij vrijere vragen. <a href="https://github.com/carelevers/checkapk#lokale-ai" target="_blank" rel="noopener">Zo zet je hem aan</a>.`;
    });
    if (params.q) ask(el, params.q);
    else el.querySelector('#q').focus();
  }

  window.Assistant = { page, ruleParse, understand, parseYears, norm, factsFor };
})();
